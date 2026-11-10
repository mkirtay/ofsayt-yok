import { useCallback, useMemo, useState } from 'react';
import { RISK_PRESETS, MIN_RELIABLE_SAMPLE, suggestCombo, type CalibrationBand, type ComboCandidate, type RiskLevel } from '@/utils/comboPicks';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { summarize } from './summary';
import styles from './adminCombo.module.scss';

type Row = ComboCandidate & { homeName: string; awayName: string };
type OddsInfo = { odd: number | null; bookmaker?: string; median?: number; bookmakers?: number; status: string };
type History = { evaluatedMatches: number; bands: CalibrationBand[]; sinceVersion: number };

const PICK_LABEL: Record<string, string> = {
  home: 'Ev sahibi kazanır',
  draw: 'Beraberlik',
  away: 'Deplasman kazanır',
  over15: '2 gol ve üzeri',
  over25: '3 gol ve üzeri',
  over35: '4 gol ve üzeri',
  btts: 'İki takım da gol bulur',
  htOver05: 'İlk yarıda gol olur',
  htOver15: 'İlk yarıda 2+ gol',
  homeToScore: 'Ev sahibi gol bulur',
  awayToScore: 'Deplasman gol bulur',
  bttsFirstHalf: 'İlk yarı iki takım da gol bulur',
};
const STATUS_TEXT: Record<string, string> = {
  'no-fixture': 'AF maçı eşleşmedi',
  'no-odds': 'oran henüz açılmadı',
  'no-market': 'bu pazar yok',
  error: 'oran alınamadı',
};

const pctText = (p: number) => `%${(p * 100).toFixed(1).replace('.', ',')}`;
const oddText = (o: number) => o.toFixed(2).replace('.', ',');

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}

export default function AdminCombo() {
  const [date, setDate] = useState(() => todayIsoIstanbul());
  const [includePast, setIncludePast] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [history, setHistory] = useState<History | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [odds, setOdds] = useState<Record<string, OddsInfo>>({});
  const [risk, setRisk] = useState<RiskLevel>('balanced');
  const [minPct, setMinPct] = useState<number>(RISK_PRESETS.balanced.minPct);
  const [maxMatches, setMaxMatches] = useState<number>(RISK_PRESETS.balanced.maxMatches);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const withOdds = useMemo<Row[]>(() => rows.map((r) => ({ ...r, odd: odds[r.matchId]?.odd ?? null })), [rows, odds]);
  const chosen = useMemo(() => withOdds.filter((r) => selected.has(r.matchId)), [withOdds, selected]);
  const summary = useMemo(() => summarize(chosen), [chosen]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const data = await json<{ candidates: Row[]; history: History }>(await fetch(`/api/admin/kombine?date=${date}${includePast ? '&past=1' : ''}`));
      setRows(data.candidates);
      setHistory(data.history);
      setSelected(new Set());
      setOdds({});
      if (data.candidates.length === 0) setMessage('Bu gün için analizi olan (v5+) yaklaşan maç yok.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  }, [date, includePast]);

  const fetchOdds = useCallback(
    async (ids: string[]): Promise<Record<string, OddsInfo>> => {
      const data = await json<{ odds: Array<{ matchId: string; status: string; market?: { odd: number; bookmaker: string; median: number; bookmakers: number } }> }>(
        await fetch('/api/admin/kombine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, picks: ids.map((matchId) => ({ matchId })) }),
        }),
      );
      const next: Record<string, OddsInfo> = {};
      for (const o of data.odds) {
        next[o.matchId] = o.status === 'ok' && o.market ? { odd: o.market.odd, bookmaker: o.market.bookmaker, median: o.market.median, bookmakers: o.market.bookmakers, status: 'ok' } : { odd: null, status: o.status };
      }
      setOdds((prev) => ({ ...prev, ...next }));
      return next;
    },
    [date],
  );

  const applyRisk = (level: RiskLevel) => {
    setRisk(level);
    setMinPct(RISK_PRESETS[level].minPct);
    setMaxMatches(RISK_PRESETS[level].maxMatches);
  };

  const suggest = useCallback(async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const targetOdds = target.trim() ? Number(target.replace(',', '.')) : null;
      let pool = withOdds;
      if (targetOdds != null) {
        // Hedef oran için oranlar gerekir: yalnız eşiği geçen en güçlü 12 maçın oranı çekilir (tümü değil).
        const top = withOdds.filter((r) => r.pct >= minPct).sort((a, b) => b.pct - a.pct).slice(0, 12);
        const got = await fetchOdds(top.map((r) => r.matchId));
        pool = withOdds.map((r) => ({ ...r, odd: got[r.matchId]?.odd ?? odds[r.matchId]?.odd ?? null }));
      }
      const res = suggestCombo(pool, { minPct, maxMatches, targetOdds });
      setSelected(new Set(res.picks.map((p) => p.matchId)));
      if (res.reason === 'no-candidates') setMessage('Bu eşikte uygun maç yok (ya da oranı olan maç yok).');
      if (res.reason === 'target-unreachable') setMessage(`Hedef oran bu eşik ve maç sayısıyla ulaşılamıyor; ulaşılabilen en yüksek kombine oran ≈ ${oddText(res.maxReachableOdds ?? 0)}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Öneri üretilemedi');
    } finally {
      setBusy(false);
    }
  }, [target, withOdds, minPct, maxMatches, fetchOdds, odds]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const getOddsForChosen = async () => {
    setBusy(true);
    setError(null);
    try {
      await fetchOdds(chosen.slice(0, 12).map((r) => r.matchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Oranlar alınamadı');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Kombine aracı (yalnız yönetici)</h1>
      <p className={styles.note}>
        Olasılıklar modelin tahminidir; kombine isabet olasılığı seçili maçların olasılıklarının ÇARPIMIDIR (maç ekledikçe düşer). Oranlar uluslararası
        bookmaker&apos;lardan yaklaşık piyasa oranıdır — Türkiye&apos;deki bir şirketin oranı değildir. Hiçbir sonuç garanti değildir.
      </p>

      <section className={styles.panel} aria-label="Ayarlar">
        <div className={styles.controls}>
          <label className={styles.field}>
            Gün
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>
              <input type="checkbox" checked={includePast} onChange={(e) => setIncludePast(e.target.checked)} /> Başlamış maçları da göster
            </span>
          </label>
          <button type="button" className={styles.btn} onClick={load} disabled={busy}>
            Maçları getir
          </button>
        </div>
        <div className={styles.controls}>
          <label className={styles.field}>
            Risk düzeyi
            <select value={risk} onChange={(e) => applyRisk(e.target.value as RiskLevel)}>
              <option value="safe">Düşük risk (az maç, yüksek olasılık)</option>
              <option value="balanced">Dengeli</option>
              <option value="bold">Yüksek risk (çok maç)</option>
            </select>
          </label>
          <label className={styles.field}>
            En düşük pazar olasılığı (%)
            <input type="number" min={50} max={99} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            Maç sayısı (en çok)
            <input type="number" min={1} max={10} value={maxMatches} onChange={(e) => setMaxMatches(Number(e.target.value))} />
          </label>
          <label className={styles.field}>
            Hedef kombine oran (isteğe bağlı)
            <input inputMode="decimal" placeholder="örn. 3,5" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>
          <button type="button" className={styles.btn} onClick={suggest} disabled={busy || rows.length === 0}>
            Öner
          </button>
        </div>
        {error ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.warn}>{message}</p> : null}
      </section>

      {rows.length > 0 ? (
        <section className={styles.panel} aria-label="Adaylar">
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th />
                  <th>Maç</th>
                  <th>En güçlü pazar</th>
                  <th className={styles.num}>Olasılık</th>
                  <th className={styles.num}>Yaklaşık oran</th>
                </tr>
              </thead>
              <tbody>
                {withOdds.map((r) => {
                  const o = odds[r.matchId];
                  return (
                    <tr key={r.matchId}>
                      <td>
                        <input type="checkbox" checked={selected.has(r.matchId)} onChange={() => toggle(r.matchId)} aria-label={`${r.label} seç`} />
                      </td>
                      <td>
                        {r.label}
                        <div className={styles.muted}>
                          {r.competition ?? ''} {r.kickoffIso ? new Date(r.kickoffIso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }) : ''}
                        </div>
                      </td>
                      <td>{PICK_LABEL[r.key] ?? r.key}</td>
                      <td className={styles.num}>%{r.pct}</td>
                      <td className={styles.num}>
                        {o ? (
                          o.odd ? (
                            <>
                              {oddText(o.odd)}
                              <div className={styles.muted}>
                                {o.bookmaker} · medyan {oddText(o.median ?? o.odd)} ({o.bookmakers})
                              </div>
                            </>
                          ) : (
                            <span className={styles.muted}>{STATUS_TEXT[o.status] ?? o.status}</span>
                          )
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className={styles.panel} aria-label="Kombine özeti">
        <div className={styles.summary}>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Seçili maç</div>
            <div className={styles.statValue}>{summary.count}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Kombine isabet olasılığı (model)</div>
            <div className={styles.statValue}>{summary.count ? pctText(summary.probability) : '—'}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Kombine yaklaşık oran</div>
            <div className={styles.statValue}>{summary.odds ? oddText(summary.odds) : '—'}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Başabaş için gereken olasılık</div>
            <div className={styles.statValue}>{summary.breakEven != null ? pctText(summary.breakEven) : '—'}</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statLabel}>Fark (olasılık × oran − 1)</div>
            <div className={styles.statValue}>{summary.edge != null ? `${summary.edge >= 0 ? '+' : ''}${(summary.edge * 100).toFixed(1).replace('.', ',')}%` : '—'}</div>
          </div>
        </div>
        {summary.count > 0 && summary.odds == null ? (
          <p className={styles.muted}>{summary.missingOdds} maçın oranı yok / henüz getirilmedi.</p>
        ) : null}
        <div className={styles.controls}>
          <button type="button" className={styles.btn} onClick={getOddsForChosen} disabled={busy || chosen.length === 0}>
            Seçili maçların oranlarını getir
          </button>
        </div>
        <p className={styles.muted}>Oranlar maçtan yaklaşık 1–2 gün önce açılır; geçmiş oran saklanmaz. Fark negatifse oran, modelin olasılığına göre düşüktür.</p>
      </section>

      {history ? (
        <section className={styles.panel} aria-label="Geçmiş isabet">
          <strong>Geçmiş isabet (en güçlü tek pazar, prompt v{history.sinceVersion}+, {history.evaluatedMatches} değerlendirilmiş maç)</strong>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Model olasılığı</th>
                <th className={styles.num}>Maç</th>
                <th className={styles.num}>Tuttu</th>
                <th className={styles.num}>Gerçekleşme</th>
              </tr>
            </thead>
            <tbody>
              {history.bands.map((b) => (
                <tr key={b.label}>
                  <td>{b.label}</td>
                  <td className={styles.num}>{b.matches}</td>
                  <td className={styles.num}>{b.hits}</td>
                  <td className={styles.num}>
                    {b.rate == null ? '—' : `%${String(b.rate).replace('.', ',')}`}
                    {b.matches > 0 && b.matches < MIN_RELIABLE_SAMPLE ? <span className={styles.muted}> az örnek</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.muted}>
            Örnek küçüktür (bant başına {MIN_RELIABLE_SAMPLE} maçın altı güvenilir değildir). Model şimdiye kadar temkinli görünüyor ama bu gelecek için bir söz değildir.
          </p>
        </section>
      ) : null}
    </main>
  );
}
