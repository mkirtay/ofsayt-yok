import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@/lib/i18nNamespaces/combo';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { MIN_RELIABLE_SAMPLE, suggestCombo, type CalibrationBand, type ComboCandidate } from '@/utils/comboPicks';
import {
  MAX_SYSTEM_LEGS,
  MIN_PCT_FLOOR,
  adviseType,
  effectiveUnit,
  parseMisli,
  parseStake,
  parseTargetOdds,
  riskToMaxMatches,
  riskToMinPct,
  straightOutcome,
  suggestForRisk,
  systemOutcome,
} from '@/utils/comboPlan';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';
import type { DailyPayload, DailyCoupon, CouponKind } from '@/server/combo/dailyCoupons';
import styles from './comboHomeCard.module.scss';

type Row = ComboCandidate & { homeName: string; awayName: string; homeLogo?: string | null; awayLogo?: string | null; source?: 'db' | 'test'; national?: boolean };
export type DailyState = { state: 'loading' } | { state: 'error' } | { state: 'pending'; at: string } | { state: 'ready'; payload: DailyPayload };
type DailyStored = (Exclude<DailyState, { state: 'loading' }> & { date: string }) | null;
type History = { evaluatedMatches: number; bands: CalibrationBand[] };
type OddsResponse = { odds: Array<{ matchId: string; status: string; market?: { odd: number } }> };
type Mode = 'straight' | 'system';

/** Hazır risk chip'leri (kaydırıcıyı bu yüzdelere getirir). */
const RISK_CHIPS = [
  { key: 'safe', value: 20 },
  { key: 'balanced', value: 50 },
  { key: 'bold', value: 80 },
] as const;

const fmtPct = (p: number) => `%${(p * 100).toFixed(1).replace('.', ',')}`;
const fmtOdd = (o: number) => o.toFixed(2).replace('.', ',');
const fmtMoney = (n: number) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n)} TL`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtMoney(Math.abs(n))}`;

async function getJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Ana sayfa "Günün Kombinesi" kartı — YALNIZ ADMIN + COMBO_TOOL_USER_IDS (oturumdaki `comboAccess`); MatchHubPage onu yalnız
 * bu durumda `next/dynamic` ile yükler. Akış: risk % (kaydırıcı + hazır chip'ler) + yatırılacak tutar + (isteğe bağlı) istenen
 * oran + tür (düz kombine / sistem) → "Öner" → seçim + özet. Hesaplar `utils/comboPlan.ts` (saf, testli). Kapalı başlar; açılınca
 * adaylar, "Öner"de yalnız gereken maçların oranı çekilir.
 */
export default function ComboHomeCard() {
  const { t } = useTranslation('combo');
  const [kind, setKind] = useState<CouponKind>('safe');
  const [day, setDay] = useState<'today' | 'tomorrow'>('today');
  const [daily, setDaily] = useState<DailyStored>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);
  const [risk, setRisk] = useState(50);
  const [stake, setStake] = useState('1000');
  const [misli, setMisli] = useState('1');
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState<Mode>('straight');
  const [k, setK] = useState(0);
  const [advMax, setAdvMax] = useState('');
  const [advMin, setAdvMin] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [odds, setOdds] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [ran, setRan] = useState(false);
  const requested = useRef(new Set<string>());
  const date = useMemo(() => (day === 'today' ? todayIsoIstanbul() : shiftIsoDate(todayIsoIstanbul(), 1)), [day]);

  const withOdds = useMemo(() => (rows ?? []).map((r) => ({ ...r, odd: odds[r.matchId] ?? null })), [rows, odds]);
  const chosen = useMemo(() => withOdds.filter((r) => selected.includes(r.matchId)), [withOdds, selected]);
  const stakeNum = useMemo(() => parseStake(stake), [stake]);
  const misliNum = useMemo(() => parseMisli(misli), [misli]);
  // Birim tutar = tutar × misli: düz kombine bu tutarla, sistemin HER kombinasyonu bu tutarla oynanır.
  const unit = useMemo(() => effectiveUnit(stakeNum, misliNum), [stakeNum, misliNum]);
  const effK = mode === 'system' ? Math.min(Math.max(k || chosen.length - 1, 1), Math.max(chosen.length, 1)) : chosen.length;

  const straight = useMemo(() => (unit != null && mode === 'straight' ? straightOutcome(chosen, unit) : null), [chosen, unit, mode]);
  const system = useMemo(() => {
    if (unit == null || mode !== 'system' || chosen.length === 0 || chosen.some((c) => !(typeof c.odd === 'number' && c.odd > 1))) return null;
    return systemOutcome(
      chosen.map((c) => ({ p: c.pct / 100, odd: c.odd as number })),
      effK,
      unit,
    );
  }, [chosen, unit, mode, effK]);
  const advice = useMemo(() => (chosen.length ? adviseType(chosen.length, risk, unit ?? 0) : null), [chosen.length, risk, unit]);
  const missingOdds = chosen.filter((c) => !(typeof c.odd === 'number' && c.odd > 1)).length;

  const fetchOdds = useCallback(
    async (ids: string[]): Promise<Record<string, number | null>> => {
      const need = ids.filter((id) => !requested.current.has(id)).slice(0, 12);
      if (need.length === 0) return {};
      need.forEach((id) => requested.current.add(id));
      try {
        const data = await getJson<OddsResponse>(
          await fetch('/api/combo/day', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, picks: need.map((matchId) => ({ matchId })) }),
          }),
        );
        const next: Record<string, number | null> = {};
        for (const o of data.odds) next[o.matchId] = o.status === 'ok' && o.market ? o.market.odd : null;
        setOdds((prev) => ({ ...prev, ...next }));
        return next;
      } catch {
        need.forEach((id) => requested.current.delete(id));
        return {};
      }
    },
    [date],
  );

  const load = useCallback(() => {
    fetch(`/api/combo/day?date=${date}`, { credentials: 'include' })
      .then((r) => getJson<{ candidates: Row[]; history: History }>(r))
      .then((d) => {
        setRows(d.candidates);
        setHistory(d.history);
      })
      .catch(() => setFailed(true));
  }, [date]);

  const loadDaily = useCallback(() => {
    fetch(`/api/combo/daily?date=${date}`, { credentials: 'include' })
      .then((r) => getJson<{ state: 'ready'; payload: DailyPayload } | { state: 'pending'; at: string }>(r))
      .then((d) => setDaily({ ...d, date }))
      .catch(() => setDaily({ state: 'error', date }));
  }, [date]);

  // Kart açık gelir: mount'ta / gün değişince hazır öneriler; özel akışın adayları yalnız "Kendin ayarla" açılınca.
  useEffect(() => {
    loadDaily();
  }, [loadDaily]);

  const resetManual = () => {
    setRows(null);
    setFailed(false);
    setSelected([]);
    setOdds({});
    setRan(false);
    setMessage(null);
    requested.current = new Set();
  };

  const pickDay = (d: 'today' | 'tomorrow') => {
    if (d === day) return;
    resetManual();
    setDay(d);
  };

  const onManualToggle = (isOpen: boolean) => {
    if (isOpen && !rows && !failed) load();
  };

  const run = async () => {
    if (!rows) return;
    setMessage(null);
    if (misliNum == null) return setMessage(t('misliInvalid'));
    if (unit == null) return setMessage(t('stakeInvalid'));
    const targetOdds = target.trim() ? parseTargetOdds(target) : null;
    if (target.trim() && targetOdds == null) return setMessage(t('targetInvalid'));
    const maxMatches = Math.min(Math.max(Number(advMax) || riskToMaxMatches(risk), 1), mode === 'system' ? MAX_SYSTEM_LEGS : 10);
    setBusy(true);
    setRan(true);
    try {
      // Oran gerektiren her durumda (hedef oran / sistem) eşiği geçen en güçlü 12 maçın oranı çekilir — tümü değil.
      const floor = Number(advMin) > 0 ? Number(advMin) : MIN_PCT_FLOOR;
      const top = [...withOdds].filter((r) => r.pct >= floor).sort((a, b) => b.pct - a.pct).slice(0, 12);
      const got = targetOdds != null || mode === 'system' ? await fetchOdds(top.map((r) => r.matchId)) : {};
      const pool = withOdds.map((r) => ({ ...r, odd: got[r.matchId] ?? odds[r.matchId] ?? null }));
      let ids: string[];
      if (mode === 'system') {
        const withOddsPool = pool.filter((r) => typeof r.odd === 'number' && r.odd > 1);
        const start = Number(advMin) > 0 ? Number(advMin) : riskToMinPct(risk);
        // Sistem: riskin eşiğindeki en güçlü n maç; yetmezse eşik taban değere kadar gevşetilir.
        let picks = withOddsPool.filter((r) => r.pct >= start);
        for (let m = start; picks.length < Math.min(3, maxMatches) && m > MIN_PCT_FLOOR; m -= 5) picks = withOddsPool.filter((r) => r.pct >= m - 5);
        picks = picks.sort((a, b) => b.pct - a.pct).slice(0, maxMatches);
        ids = picks.map((p) => p.matchId);
        setK(Math.max(picks.length - 1, 1));
        if (picks.length < 3) setMessage(t('noPick'));
      } else if (Number(advMin) > 0) {
        const res = suggestCombo(pool, { minPct: Number(advMin), maxMatches, targetOdds });
        ids = res.picks.map((p) => p.matchId);
        if (res.reason === 'target-unreachable') setMessage(t('targetUnreachable', { max: fmtOdd(res.maxReachableOdds ?? 0) }));
      } else {
        const res = suggestForRisk(pool, { risk, maxMatches, targetOdds });
        ids = res.picks.map((p) => p.matchId);
        if (res.reason === 'target-unreachable') setMessage(t('targetUnreachable', { max: fmtOdd(res.maxReachableOdds ?? 0) }));
        else if (res.relaxed && ids.length > 0) setMessage(t('relaxedNote', { risk, used: res.usedMinPct }));
      }
      setSelected(ids);
      if (targetOdds == null && mode === 'straight') void fetchOdds(ids);
    } finally {
      setBusy(false);
    }
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

  const dailyState: DailyState = daily && daily.date === date ? daily : { state: 'loading' };
  const showTestBadge = dailyState.state === 'ready' && dailyState.payload.testData;
  return (
    <section className={styles.card} aria-label={t('title')}>
      <header className={styles.head}>
        <TicketIcon />
        <h2 className={styles.title}>{t('title')}</h2>
        {showTestBadge ? <span className={styles.badge}>{t('badge')}</span> : null}
      </header>
      <div className={styles.body}>
          <div className={styles.segment} role="group" aria-label={t('dayLabel')}>
            {(['today', 'tomorrow'] as const).map((d) => (
              <button key={d} type="button" className={`${styles.segBtn} ${day === d ? styles.segActive : ''}`} aria-pressed={day === d} onClick={() => pickDay(d)}>
                {t(`day.${d}`)}
              </button>
            ))}
          </div>
          <DailyPresets state={dailyState} kind={kind} onKind={setKind} t={t} />

          <details className={styles.adv} onToggle={(e) => onManualToggle((e.currentTarget as HTMLDetailsElement).open)}>
            <summary>{t('manualTitle')}</summary>
            <div className={styles.manualBody}>
              <p className={styles.muted}>{t('manualIntro')}</p>
          {failed ? <p className={styles.muted}>{t('error')}</p> : null}
          {!rows && !failed ? <p className={styles.muted}>{t('loading')}</p> : null}
          {rows && rows.length === 0 ? <p className={styles.muted}>{t('empty')}</p> : null}

          {rows && rows.length > 0 ? (
            <>
              <div className={styles.field}>
                <label htmlFor="combo-risk" className={styles.inlineLabel}>
                  {t('risk.label')}: <strong>%{risk}</strong>
                </label>
                <input id="combo-risk" className={styles.range} type="range" min={0} max={100} step={5} value={risk} onChange={(e) => setRisk(Number(e.target.value))} />
                <div className={styles.chips} role="group" aria-label={t('risk.label')}>
                  {RISK_CHIPS.map((c) => (
                    <button key={c.key} type="button" className={`${styles.chip} ${risk === c.value ? styles.chipActive : ''}`} aria-pressed={risk === c.value} onClick={() => setRisk(c.value)}>
                      {t(`risk.${c.key}`)}
                    </button>
                  ))}
                </div>
                <p className={styles.small}>{t('risk.hint')}</p>
              </div>

              <div className={styles.threeCol}>
                <label className={styles.fieldLabel}>
                  {t('stake')}
                  <input className={styles.input} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
                </label>
                <label className={styles.fieldLabel}>
                  {t('misli')}
                  <input className={styles.input} inputMode="numeric" value={misli} onChange={(e) => setMisli(e.target.value)} />
                </label>
                <label className={`${styles.fieldLabel} ${styles.spanAll}`}>
                  {t('targetField')}
                  <input className={styles.input} inputMode="decimal" placeholder={t('targetHint')} value={target} onChange={(e) => setTarget(e.target.value)} />
                </label>
              </div>

              {unit != null && misliNum != null && misliNum > 1 ? <p className={styles.small}>{t('unitHint', { amount: new Intl.NumberFormat('tr-TR').format(stakeNum ?? 0), misli: misliNum })}</p> : null}

              <div className={styles.field}>
                <span className={styles.fieldLabel}>{t('type.label')}</span>
                <div className={styles.chips} role="group" aria-label={t('type.label')}>
                  {(['straight', 'system'] as const).map((m) => (
                    <button key={m} type="button" className={`${styles.chip} ${mode === m ? styles.chipActive : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
                      {t(`type.${m}`)}
                    </button>
                  ))}
                </div>
                {advice ? (
                  <p className={styles.small}>
                    {t('advice.label')}: <strong>{advice.type === 'system' ? t('advice.system', { k: advice.k ?? 0, n: chosen.length }) : t('advice.straight')}</strong> · {t(`advice.${advice.reason}`)}
                  </p>
                ) : null}
              </div>

              <button type="button" className={`${styles.chip} ${styles.run}`} onClick={() => void run()} disabled={busy}>
                {busy ? t('loading') : t('run')}
              </button>
              {message ? <p className={styles.note}>{message}</p> : null}

              {ran && chosen.length === 0 && !busy ? <p className={styles.muted}>{t('noPick')}</p> : null}
              {chosen.length > 0 ? (
                <>
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
                            {r.odd ? fmtOdd(r.odd) : '—'}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  {mode === 'system' ? (
                    <label className={styles.fieldLabel}>
                      {t('type.k')}
                      <select className={styles.input} value={effK} onChange={(e) => setK(Number(e.target.value))}>
                        {Array.from({ length: chosen.length }, (_, i) => i + 1).map((v) => (
                          <option key={v} value={v}>
                            {v} / {chosen.length}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  {mode === 'straight' && straight ? (
                    <dl className={styles.stats}>
                      <Stat label={t('straightSummary.potential')} value={fmtMoney(straight.potentialReturn)} sub={t('straightSummary.stakeTimesOdds', { amount: new Intl.NumberFormat('tr-TR').format(straight.stake), mult: fmtOdd(straight.odds) })} />
                      <Stat label={t('straightSummary.probability')} value={fmtPct(straight.probability)} />
                      <Stat label={t('straightSummary.breakEven')} value={fmtPct(straight.breakEven)} />
                      <Stat label={t('straightSummary.expected')} value={signed(straight.expectedProfit)} />
                    </dl>
                  ) : null}
                  {mode === 'system' && system ? (
                    <>
                      <dl className={styles.stats}>
                        <Stat label={t('systemSummary.combinations')} value={`${system.combinations}`} sub={`${system.k}/${system.n}`} />
                        <Stat label={t('systemSummary.totalStake')} value={fmtMoney(system.totalStake)} />
                        <Stat label={t('systemSummary.maxReturn')} value={fmtMoney(system.maxReturn)} />
                        <Stat label={t('systemSummary.expectedReturn')} value={fmtMoney(system.expectedReturn)} />
                        <Stat label={t('systemSummary.expected')} value={signed(system.expectedProfit)} />
                        <Stat label={t('systemSummary.profitProb')} value={fmtPct(system.profitProbability)} />
                        <Stat label={t('systemSummary.anyHit')} value={fmtPct(system.anyHitProbability)} wide />
                      </dl>
                      <p className={styles.small}>{t('systemSummary.hint')}</p>
                    </>
                  ) : null}
                  {((mode === 'straight' && !straight) || (mode === 'system' && !system)) && missingOdds > 0 ? <p className={styles.small}>{t('needOdds')}</p> : null}
                  <p className={styles.small}>{t('oddLabel')}</p>
                  {band ? (
                    <p className={styles.small}>
                      {band.rate == null ? t('historyNone') : t('history', { band: band.label, rate: `%${String(band.rate).replace('.', ',')}`, n: band.matches })}
                      {band.matches > 0 && band.matches < MIN_RELIABLE_SAMPLE ? ` ${t('historySmall')}` : ''}
                    </p>
                  ) : null}
                </>
              ) : null}

              <details className={styles.adv}>
                <summary>{t('advanced')}</summary>
                <div className={styles.advGrid}>
                  <label>
                    {t('maxMatchesAdv')}
                    <input type="number" min={1} max={10} value={advMax} placeholder={String(riskToMaxMatches(risk))} onChange={(e) => setAdvMax(e.target.value)} />
                  </label>
                  <label>
                    {t('minPctAdv')}
                    <input type="number" min={50} max={99} value={advMin} placeholder={String(riskToMinPct(risk))} onChange={(e) => setAdvMin(e.target.value)} />
                  </label>
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
                {mode === 'system' && chosen.length > MAX_SYSTEM_LEGS ? <p className={styles.small}>{t('systemLimit')}</p> : null}
              </details>
            </>
          ) : null}
            </div>
          </details>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, wide }: { label: string; value: string; sub?: string; wide?: boolean }) {
  return (
    <div className={`${styles.stat} ${wide ? styles.statWide : ''}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub ? <span className={styles.statSub}>{sub}</span> : null}
    </div>
  );
}


function fmtPct1(p: number) {
  return `%${(p * 100).toFixed(1).replace('.', ',')}`;
}

type TFn = (key: string, opts?: Record<string, unknown>) => string;

function TicketIcon() {
  return (
    <svg className={styles.icon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z" />
      <path d="M10 7v10" strokeDasharray="2 2.5" />
    </svg>
  );
}

const KINDS: readonly CouponKind[] = ['safe', 'balanced', 'bold'];

/** Hazır öneriler (Temkinli / Dengeli / Riskli): aynı anda YALNIZ seçili kuponun içeriği görünür. */
export function DailyPresets({ state, kind, onKind, t }: { state: DailyState; kind: CouponKind; onKind: (k: CouponKind) => void; t: TFn }) {
  if (state.state === 'loading') return <p className={styles.muted}>{t('loading')}</p>;
  if (state.state === 'error') return <p className={styles.muted}>{t('error')}</p>;
  if (state.state === 'pending') return <p className={styles.muted}>{t('presets.pending', { at: state.at })}</p>;
  const p = state.payload;
  // Eski biçimli (önbellekte kalmış) kupon: adil oran yoksa çizilmez.
  const valid = p.coupons?.every((c) => typeof c.fairOdds === 'number' && c.legs.every((l) => typeof l.fairOdd === 'number'));
  if (p.status !== 'ok' || !valid || p.coupons.length === 0) return <p className={styles.muted}>{t('presets.insufficient')}</p>;
  const coupon = p.coupons.find((c) => c.kind === kind) ?? null;
  return (
    <div className={styles.presets}>
      <div className={styles.tabs} role="tablist" aria-label={t('presets.label')}>
        {KINDS.map((k) => (
          <button key={k} id={`combo-tab-${k}`} type="button" role="tab" aria-selected={kind === k} aria-controls="combo-tabpanel" tabIndex={kind === k ? 0 : -1} className={`${styles.tab} ${kind === k ? styles.tabActive : ''}`} onClick={() => onKind(k)}>
            {t(`presets.${k}`)}
          </button>
        ))}
      </div>
      <div id="combo-tabpanel" role="tabpanel" aria-labelledby={`combo-tab-${kind}`}>
        {coupon ? <Preset coupon={coupon} testData={p.testData} t={t} /> : <p className={styles.muted}>{t('noPick')}</p>}
      </div>
    </div>
  );
}

function Preset({ coupon, testData, t }: { coupon: DailyCoupon; testData: boolean; t: TFn }) {
  const pct1 = (n: number) => String(n).replace('.', ',');
  return (
    <div className={styles.preset}>
      <dl className={styles.summary}>
        <div>
          <dt>{t('presets.odds')}</dt>
          <dd className={styles.bigNum}>{fmtOdd(coupon.fairOdds)}</dd>
        </div>
        <div>
          <dt>{t('presets.probability')}</dt>
          <dd className={`${styles.bigNum} ${styles.bigGreen}`}>{fmtPct1(coupon.probability)}</dd>
        </div>
      </dl>
      <ul className={styles.list}>
        {coupon.legs.map((l) => (
          <li key={l.matchId} className={styles.row}>
            <span className={styles.teams}>
              <TeamLogo src={l.homeLogo} width={16} alt="" />
              <TeamLogo src={l.awayLogo} width={16} alt="" />
              <span className={styles.names}>
                {l.homeName} – {l.awayName}
              </span>
            </span>
            <span className={styles.pickText}>
              {t(`pick.${l.key}`)} · %{pct1(Math.round(l.pct))}
            </span>
            <span className={styles.oddBadge} title={t('presets.odds')}>
              {fmtOdd(l.fairOdd)}
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.small}>{t('presets.fairHint')}</p>
      <p className={styles.footer}>
        <span>{t('presets.count', { n: coupon.legs.length })}</span>
        <span>{t('presets.noGuarantee')}</span>
      </p>
      <details className={styles.adv}>
        <summary>{t('presets.details')}</summary>
        {testData ? <p className={styles.small}>{t('presets.testData')}</p> : null}
        <ul className={styles.perMatch}>
          {coupon.legs.map((l) => (
            <li key={l.matchId}>
              {l.homeName} – {l.awayName}: {t(`pick.${l.key}`)} ·{' '}
              {t('presets.legLine', {
                pct: pct1(l.pct),
                model: l.modelPct,
                market: l.marketPct == null ? '—' : `%${pct1(l.marketPct)}`,
                fair: fmtOdd(l.fairOdd),
                ref: l.refOdd == null ? '—' : fmtOdd(l.refOdd),
              })}
            </li>
          ))}
        </ul>
        {coupon.refOdds != null ? <p className={styles.small}>{t('presets.refTotal', { total: fmtOdd(coupon.refOdds) })}</p> : null}
        <p className={styles.small}>{t('presets.method')}</p>
        <p className={styles.small}>{t('presets.minLegsNote')}</p>
        <p className={styles.small}>{t('disclaimer')}</p>
      </details>
    </div>
  );
}
