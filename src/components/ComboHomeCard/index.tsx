import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@/lib/i18nNamespaces/combo';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { MIN_RELIABLE_SAMPLE, RISK_PRESETS, suggestCombo, type CalibrationBand, type ComboCandidate, type RiskLevel } from '@/utils/comboPicks';
import { todayIsoIstanbul } from '@/utils/dateStrip';
import { summarize } from './summary';
import styles from './comboHomeCard.module.scss';

type Row = ComboCandidate & { homeName: string; awayName: string; homeLogo?: string | null; awayLogo?: string | null };
type OddsInfo = { odd: number | null };
type History = { evaluatedMatches: number; bands: CalibrationBand[] };
type OddsResponse = { odds: Array<{ matchId: string; status: string; market?: { odd: number } }> };

const RISKS: RiskLevel[] = ['safe', 'balanced', 'bold'];

const fmtPct = (p: number) => `%${(p * 100).toFixed(1).replace('.', ',')}`;
const fmtOdd = (o: number) => o.toFixed(2).replace('.', ',');

async function getJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Ana sayfa "Günün Kombinesi" kartı — YALNIZ ADMIN + COMBO_TOOL_USER_IDS (oturumdaki `comboAccess`); MatchHubPage onu yalnız
 * bu durumda `next/dynamic` ile yükler, yetkisiz kullanıcıya ek JS / istek / yerleşim yok. Kapalı başlar (tek satır); açılınca
 * adaylar ve (öneri çıkınca) yalnız önerilen maçların oranı çekilir. Stiller tema tokenları + ortak chip mixin'i.
 */
export default function ComboHomeCard() {
  const { t } = useTranslation('combo');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const [risk, setRisk] = useState<RiskLevel>('balanced');
  const [minPct, setMinPct] = useState<number>(RISK_PRESETS.balanced.minPct);
  const [maxMatches, setMaxMatches] = useState<number>(RISK_PRESETS.balanced.maxMatches);
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [odds, setOdds] = useState<Record<string, OddsInfo>>({});
  const [note, setNote] = useState<string | null>(null);
  const requested = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const date = useMemo(() => todayIsoIstanbul(), []);

  const withOdds = useMemo(() => (rows ?? []).map((r) => ({ ...r, odd: odds[r.matchId]?.odd ?? null })), [rows, odds]);
  const chosen = useMemo(() => withOdds.filter((r) => selected.includes(r.matchId)), [withOdds, selected]);
  const summary = useMemo(() => summarize(chosen), [chosen]);

  const fetchOdds = useCallback(
    async (ids: string[]): Promise<Record<string, OddsInfo>> => {
      const need = ids.filter((id) => !requested.current.has(id)).slice(0, 12);
      if (need.length === 0) return {};
      need.forEach((id) => requested.current.add(id));
      setPending((prev) => new Set([...prev, ...need]));
      try {
        const data = await getJson<OddsResponse>(
          await fetch('/api/combo/day', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, picks: need.map((matchId) => ({ matchId })) }),
          }),
        );
        const next: Record<string, OddsInfo> = {};
        for (const o of data.odds) next[o.matchId] = { odd: o.status === 'ok' && o.market ? o.market.odd : null };
        setOdds((prev) => ({ ...prev, ...next }));
        return next;
      } catch {
        need.forEach((id) => requested.current.delete(id));
        return {};
      } finally {
        setPending((prev) => new Set([...prev].filter((id) => !need.includes(id))));
      }
    },
    [date],
  );

  const applyPreset = useCallback(
    (level: RiskLevel, list: Row[]) => {
      const p = RISK_PRESETS[level];
      setNote(null);
      const res = suggestCombo(list, { minPct: p.minPct, maxMatches: p.maxMatches });
      const ids = res.picks.map((x) => x.matchId);
      setSelected(ids);
      void fetchOdds(ids);
    },
    [fetchOdds],
  );

  // Açılınca bir kez yükle.
  useEffect(() => {
    if (!open || rows || failed) return;
    let cancelled = false;
    fetch(`/api/combo/day?date=${date}`, { credentials: 'include' })
      .then((r) => getJson<{ candidates: Row[]; history: History }>(r))
      .then((d) => {
        if (cancelled) return;
        setRows(d.candidates);
        setHistory(d.history);
        if (d.candidates.length > 0) applyPreset('balanced', d.candidates);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [open, rows, failed, date, applyPreset]);

  const pickRisk = (level: RiskLevel) => {
    setRisk(level);
    if (rows) applyPreset(level, rows);
    setMinPct(RISK_PRESETS[level].minPct);
    setMaxMatches(RISK_PRESETS[level].maxMatches);
  };

  const applyAdvanced = async () => {
    setNote(null);
    const targetOdds = target.trim() ? Number(target.replace(',', '.')) : null;
    let pool = withOdds;
    if (targetOdds != null) {
      const top = withOdds.filter((r) => r.pct >= minPct).sort((a, b) => b.pct - a.pct).slice(0, 12);
      const got = await fetchOdds(top.map((r) => r.matchId));
      pool = withOdds.map((r) => ({ ...r, odd: got[r.matchId]?.odd ?? odds[r.matchId]?.odd ?? null }));
    }
    const res = suggestCombo(pool, { minPct, maxMatches, targetOdds });
    const ids = res.picks.map((p) => p.matchId);
    setSelected(ids);
    void fetchOdds(ids);
    if (res.reason === 'target-unreachable') setNote(t('targetUnreachable', { max: fmtOdd(res.maxReachableOdds ?? 0) }));
  };

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    void fetchOdds(next);
  };

  // Geçmiş isabet: seçilen pazarların en düşük olasılığının bandı.
  const band = useMemo(() => {
    if (!history || chosen.length === 0) return null;
    const lowest = Math.min(...chosen.map((c) => c.pct));
    return history.bands.find((b) => lowest >= b.min && lowest <= b.max) ?? null;
  }, [history, chosen]);

  const panelId = 'combo-home-card-panel';
  return (
    <section className={styles.card} aria-label={t('title')}>
      <button type="button" className={styles.head} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <span className={styles.title}>{t('title')}</span>
        <span className={styles.badge}>{t('badge')}</span>
        <span className={styles.chev} aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open ? (
        <div id={panelId} className={styles.body}>
          <p className={styles.muted}>{t('intro')}</p>
          <div className={styles.chips} role="group" aria-label={t('risk.label')}>
            {RISKS.map((r) => (
              <button key={r} type="button" className={`${styles.chip} ${risk === r ? styles.chipActive : ''}`} aria-pressed={risk === r} onClick={() => pickRisk(r)}>
                {t(`risk.${r}`)}
              </button>
            ))}
          </div>

          {failed ? <p className={styles.muted}>{t('error')}</p> : null}
          {!rows && !failed ? <p className={styles.muted}>{t('loading')}</p> : null}
          {rows && rows.length === 0 ? <p className={styles.muted}>{t('empty')}</p> : null}

          {rows && rows.length > 0 ? (
            <>
              {chosen.length === 0 ? <p className={styles.muted}>{t('noPick')}</p> : null}
              <ul className={styles.list}>
                {chosen.map((r) => (
                  <li key={r.matchId} className={styles.row}>
                    <span className={styles.teams}>
                      <TeamLogo src={r.homeLogo} width={16} alt="" />
                      <TeamLogo src={r.awayLogo} width={16} alt="" />
                      <span className={styles.names}>
                        {r.homeName} – {r.awayName}
                      </span>
                    </span>
                    <span className={styles.pickLine}>
                      <span>{t(`pick.${r.key}`)}</span>
                      <span className={styles.num}>%{r.pct}</span>
                      <span className={styles.num} title={t('oddLabel')}>
                        {r.odd ? fmtOdd(r.odd) : pending.has(r.matchId) ? '…' : '—'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>

              {chosen.length > 0 ? (
                <dl className={styles.stats}>
                  <div className={styles.stat}>
                    <dt>{t('summary.probability')}</dt>
                    <dd>{fmtPct(summary.probability)}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>{t('summary.odds')}</dt>
                    <dd>{summary.odds ? fmtOdd(summary.odds) : '—'}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>{t('summary.breakEven')}</dt>
                    <dd>{summary.breakEven != null ? fmtPct(summary.breakEven) : '—'}</dd>
                  </div>
                  <div className={styles.stat} title={t('edgeHint')}>
                    <dt>{t('summary.edge')}</dt>
                    <dd>{summary.edge != null ? `${summary.edge >= 0 ? '+' : ''}${(summary.edge * 100).toFixed(1).replace('.', ',')}%` : '—'}</dd>
                  </div>
                </dl>
              ) : null}
              <p className={styles.small}>{t('oddLabel')} · {t('edgeHint')}</p>

              {band ? (
                <p className={styles.small}>
                  {band.rate == null ? t('historyNone') : t('history', { band: band.label, rate: `%${String(band.rate).replace('.', ',')}`, n: band.matches })}
                  {band.matches > 0 && band.matches < MIN_RELIABLE_SAMPLE ? ` ${t('historySmall')}` : ''}
                </p>
              ) : null}

              <details className={styles.adv}>
                <summary>{t('advanced')}</summary>
                <div className={styles.advGrid}>
                  <label>
                    {t('minPct')}
                    <input type="number" min={50} max={99} value={minPct} onChange={(e) => setMinPct(Number(e.target.value))} />
                  </label>
                  <label>
                    {t('maxMatches')}
                    <input type="number" min={1} max={10} value={maxMatches} onChange={(e) => setMaxMatches(Number(e.target.value))} />
                  </label>
                  <label>
                    {t('target')}
                    <input inputMode="decimal" placeholder={t('targetHint')} value={target} onChange={(e) => setTarget(e.target.value)} />
                  </label>
                  <button type="button" className={styles.chip} onClick={() => void applyAdvanced()}>
                    {t('apply')}
                  </button>
                </div>
                <p className={styles.small}>{t('manual')}</p>
                <ul className={styles.manual}>
                  {withOdds.map((r) => (
                    <li key={r.matchId}>
                      <label>
                        <input type="checkbox" checked={selected.includes(r.matchId)} onChange={() => toggle(r.matchId)} />
                        <span>
                          {r.homeName} – {r.awayName} · {t(`pick.${r.key}`)} %{r.pct}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {note ? <p className={styles.small}>{note}</p> : null}
              </details>
            </>
          ) : null}
          <p className={styles.small}>{t('disclaimer')}</p>
        </div>
      ) : null}
    </section>
  );
}
