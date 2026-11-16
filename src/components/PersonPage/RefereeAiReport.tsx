import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { buildMatchHref } from '@/utils/matchUrl';
import type { RefereeReportResult, RefereeReportView } from '@/server/people/refereeReport';
import type { RefereeInsightTone } from '@/config/refereeReportPrompt';
import type { CurrentMetric, RefereeReportMetrics, TrendRow } from '@/server/people/refereeReportMetrics';
import RefereeWarmup from './RefereeWarmup';
import styles from './personPage.module.scss';
import css from './refereeAiReport.module.scss';

/** 202 (başka istek üretiyor) gelirse bu aralıkla, en çok bu kadar yeniden sor. */
const RETRY_MS = 4_000;
const MAX_RETRIES = 6;

type T = (key: string, opts?: Record<string, unknown>) => string;
type Fmt = (n: number | null | undefined, digits?: number) => string;

// ── İkonlar (dekoratif; anlam her zaman yanındaki metinde) ──────────────
const Svg = ({ children, className }: { children: ReactNode; className?: string }) => (
  <svg className={className ?? css.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {children}
  </svg>
);
export const MetricIcon = ({ k }: { k: CurrentMetric['key'] | 'fouls' }) =>
  k === 'yellow' ? (
    <Svg>
      <rect x="6.5" y="3.5" width="11" height="17" rx="2" transform="rotate(8 12 12)" className={css.icYellow} />
    </Svg>
  ) : k === 'red' ? (
    <Svg>
      <rect x="6.5" y="3.5" width="11" height="17" rx="2" transform="rotate(8 12 12)" className={css.icRed} />
    </Svg>
  ) : k === 'penalties' ? (
    <Svg>
      <circle cx="12" cy="10" r="6" className={css.icStroke} />
      <path d="M12 7.2l2.2 1.6-.8 2.6h-2.8l-.8-2.6z" className={css.icFill} />
      <ellipse cx="12" cy="20" rx="3" ry="1.2" className={css.icFill} />
    </Svg>
  ) : k === 'var' ? (
    <Svg>
      <rect x="3" y="4" width="18" height="12.5" rx="2" className={css.icStroke} />
      <path d="M9 21h6M12 16.5V21" className={css.icStroke} />
      <path d="M7 8l1.6 5L10.2 8M12.4 13l1.5-5 1.5 5M12.9 11.4h2M17.2 13V8h1.3a1.4 1.4 0 010 2.8h-1.3l1.9 2.2" className={css.icThin} />
    </Svg>
  ) : (
    <Svg>
      <path d="M5 18c2-6 5-9 7-9s3 2 2 4-4 3-4 5" className={css.icStroke} />
      <circle cx="17.5" cy="6.5" r="2.5" className={css.icFill} />
    </Svg>
  );

const Whistle = () => (
  <Svg className={css.titleIcon}>
    <path d="M4 12.5a5 5 0 1010 0v-1.5h6.5V8H9a5 5 0 00-5 4.5z" className={css.icFillBrand} />
    <circle cx="9" cy="12.5" r="1.8" className={css.icHole} />
    <path d="M7 6.5L5.5 4.5" className={css.icStrokeBrand} />
  </Svg>
);

const ToneIcon = ({ tone }: { tone: RefereeInsightTone }) => (
  <span className={`${css.tone} ${css[`tone_${tone}`]}`} aria-hidden="true">
    <svg viewBox="0 0 16 16" focusable="false">
      {tone === 'up' ? (
        <path d="M8 3.5l4.5 6h-9z" />
      ) : tone === 'down' ? (
        <path d="M8 12.5l4.5-6h-9z" />
      ) : tone === 'warn' ? (
        <path d="M7 3.5h2l-.3 6.2h-1.4zM8 10.8a1.1 1.1 0 110 2.2 1.1 1.1 0 010-2.2z" />
      ) : (
        <circle cx="8" cy="8" r="3" />
      )}
    </svg>
  </span>
);

const SmallSample = ({ t, title }: { t: T; title?: string }) => (
  <span className={css.sample} title={title}>
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7v4.2M8 4.6v.2" />
    </svg>
    {t('person.aiReportSmallSample')}
  </span>
);

// ── Bölümler ───────────────────────────────────────────────────────────
const METRIC_LABEL: Record<CurrentMetric['key'], string> = {
  yellow: 'person.colYellowPm',
  red: 'person.colRedPm',
  penalties: 'person.colPenPm',
  var: 'person.colVarPm',
};

function VsLeague({ m, t, fmt }: { m: NonNullable<RefereeReportMetrics['currentSeason']>; t: T; fmt: Fmt }) {
  const rows = m.metrics.filter((x) => x.value != null);
  return (
    <ul className={css.vsList}>
      {rows.map((x, i) => {
        const max = Math.max(x.value ?? 0, x.leagueAvg ?? 0) * 1.18 || 1;
        const w = ((x.value ?? 0) / max) * 100;
        const avgAt = x.leagueAvg != null ? (x.leagueAvg / max) * 100 : null;
        const diff = x.diffPct;
        return (
          <li key={x.key} className={css.vsRow} style={{ ['--i' as string]: i }}>
            <div className={css.vsHead}>
              <MetricIcon k={x.key} />
              <span className={css.vsLabel}>{t(METRIC_LABEL[x.key])}</span>
              <span className={css.vsValue}>{fmt(x.value)}</span>
              {diff != null ? (
                <span className={`${css.diff} ${diff > 0 ? css.diffUp : diff < 0 ? css.diffDown : ''}`}>
                  <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                    {diff > 0 ? <path d="M5 1.5l4 6h-8z" /> : diff < 0 ? <path d="M5 8.5l4-6h-8z" /> : <rect x="1.5" y="4" width="7" height="2" rx="1" />}
                  </svg>
                  {t(diff > 0 ? 'person.aiReportAbove' : diff < 0 ? 'person.aiReportBelow' : 'person.aiReportSame', { value: fmt(Math.abs(diff), 0) })}
                </span>
              ) : null}
            </div>
            <div
              className={css.track}
              title={`${t(METRIC_LABEL[x.key])}: ${fmt(x.value)}${x.leagueAvg != null ? ` · ${t('person.aiReportLeagueAvgShort', { value: fmt(x.leagueAvg) })}` : ''}`}
            >
              <span className={css.fill} style={{ width: `${Math.max(2, w)}%` }} />
              {avgAt != null ? <span className={css.avgMark} style={{ left: `${avgAt}%` }} aria-hidden="true" /> : null}
            </div>
            <div className={css.vsFoot}>
              <span>{x.leagueAvg != null ? t('person.aiReportLeagueAvgShort', { value: fmt(x.leagueAvg) }) : t('person.aiReportNoAvg')}</span>
              <span className={css.events}>
                {x.events != null ? t(`person.aiReportEv_${x.key}`, { count: x.events }) : null}
                {x.smallSample ? <SmallSample t={t} title={t('person.aiReportSmallSampleHint')} /> : null}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type Outcome = 'home' | 'draw' | 'away';
const outcomeOf = (g: [number, number] | null): Outcome | null => (g ? (g[0] > g[1] ? 'home' : g[0] < g[1] ? 'away' : 'draw') : null);

function Recent({ r, t, fmt }: { r: RefereeReportMetrics['recent']; t: T; fmt: Fmt }) {
  const total = r.homeWins + r.draws + r.awayWins;
  const dist: [Outcome, number, string][] = [
    ['home', r.homeWins, t('person.aiReportHomeWin')],
    ['draw', r.draws, t('person.aiReportDraw')],
    ['away', r.awayWins, t('person.aiReportAwayWin')],
  ];
  return (
    <div className={css.recent}>
      <ol className={css.tiles}>
        {r.pairs.map((p, i) => {
          const o = outcomeOf(p.goals);
          return (
            <li key={p.id} style={{ ['--i' as string]: i }}>
              <Link
                href={buildMatchHref({ id: p.id, home: { name: p.home }, away: { name: p.away } })}
                prefetch={false}
                className={`${css.tile} ${o ? css[`out_${o}`] : ''} ${p.main ? '' : css.tileOther}`}
                title={`${p.home} ${p.score} ${p.away}${p.league ? ` · ${p.league}` : ''}${p.date ? ` · ${p.date.split('-').reverse().join('.')}` : ''}`}
              >
                <span className={css.tileTeams}>
                  <TeamLogo src={p.homeLogo} width={22} alt={p.home} />
                  <span className={css.tileScore}>{p.goals ? `${p.goals[0]}–${p.goals[1]}` : '—'}</span>
                  <TeamLogo src={p.awayLogo} width={22} alt={p.away} />
                </span>
                <span className={css.tileMeta}>{p.date ? p.date.slice(5).split('-').reverse().join('.') : ''}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      {total > 0 ? (
        <div className={css.recentStats}>
          <div className={css.kpi}>
            <span className={css.kpiValue}>{fmt(r.goalsPerMatch)}</span>
            <span className={css.kpiLabel}>{t('person.aiReportGoalsPm')}</span>
          </div>
          <div className={css.distWrap}>
            <p className={css.distTitle}>{t('person.aiReportMainOnly', { league: r.league, count: total })}</p>
            <div className={css.dist} role="img" aria-label={dist.map(([, n, l]) => `${l} ${n}`).join(', ')}>
              {dist.map(([k, n, l]) =>
                n > 0 ? <span key={k} className={`${css.distSeg} ${css[`seg_${k}`]}`} style={{ flexGrow: n }} title={`${l}: ${n}`} /> : null,
              )}
            </div>
            <ul className={css.legend}>
              {dist.map(([k, n, l]) => (
                <li key={k}>
                  <span className={`${css.swatch} ${css[`seg_${k}`]}`} aria-hidden="true" />
                  {l} <b>{n}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const shortSeason = (s: string) => s.replace(/^\d{2}(\d{2})\/\d{2}(\d{2})$/, '$1/$2');

function Trend({ rows, t, fmt }: { rows: TrendRow[]; t: T; fmt: Fmt }) {
  const asc = [...rows].reverse();
  const charts: { k: 'yellow' | 'fouls' | 'penalties'; label: string; get: (r: TrendRow) => number | null; digits: number }[] = [
    { k: 'yellow', label: t('person.colYellowPm'), get: (r) => r.yellow, digits: 2 },
    { k: 'fouls', label: t('person.colFoulsPm'), get: (r) => r.fouls, digits: 1 },
    { k: 'penalties', label: t('person.colPenPm'), get: (r) => r.penalties, digits: 2 },
  ];
  return (
    <div className={css.trend}>
      {charts.map((c) => {
        const max = Math.max(0, ...asc.map((r) => c.get(r) ?? 0)) || 1;
        return (
          <figure key={c.k} className={css.mini}>
            <figcaption className={css.miniTitle}>
              <MetricIcon k={c.k} />
              {c.label}
            </figcaption>
            <div className={css.cols}>
              {asc.map((r, i) => {
                const v = c.get(r);
                const latest = i === asc.length - 1;
                return (
                  <div key={r.seasonName} className={css.col} title={`${r.seasonName}: ${fmt(v, c.digits)} · ${t('person.aiReportMatchesCount', { count: r.matches })}`}>
                    <span className={css.colValue}>{fmt(v, c.digits)}</span>
                    <span className={css.colBarWrap}>
                      <span
                        className={`${css.colBar} ${latest ? css.colBarLatest : ''}`}
                        style={{ height: `${v != null ? Math.max(4, (v / max) * 100) : 0}%`, ['--i' as string]: i }}
                      />
                    </span>
                    <span className={css.colLabel}>{shortSeason(r.seasonName)}</span>
                  </div>
                );
              })}
            </div>
          </figure>
        );
      })}
    </div>
  );
}

function Teams({ tm, t, fmt }: { tm: NonNullable<RefereeReportMetrics['teams']>; t: T; fmt: Fmt }) {
  const groups = tm.big4 ? [
    { key: 'big4', label: t('person.aiReportBig4'), g: tm.big4 },
    { key: 'others', label: t('person.aiReportOthers'), g: tm.others },
  ] : [];
  const max = Math.max(0, ...groups.map((x) => x.g.yellowPerTeamMatch ?? 0)) * 1.15 || 1;
  return (
    <div className={css.teams}>
      {groups.length ? (
        <div className={css.groupBars}>
          <p className={css.subTitle}>{t('person.aiReportYellowPerTeamMatch')}</p>
          {groups.map((x, i) => (
            <div key={x.key} className={css.groupRow} title={`${x.label}: ${x.g.yellow} / ${x.g.teamMatches}`}>
              <span className={css.groupLabel}>{x.label}</span>
              <span className={css.track}>
                <span
                  className={`${css.fill} ${x.key === 'others' ? css.fillMuted : ''}`}
                  style={{ width: `${((x.g.yellowPerTeamMatch ?? 0) / max) * 100}%`, ['--i' as string]: i }}
                />
              </span>
              <span className={css.groupValue}>
                {fmt(x.g.yellowPerTeamMatch)}
                <small>{t('person.aiReportTeamMatches', { count: x.g.teamMatches })}</small>
              </span>
            </div>
          ))}
          {tm.big4 && tm.big4.teamMatches < 10 ? <SmallSample t={t} title={t('person.aiReportSmallSampleHint')} /> : null}
        </div>
      ) : null}
      <div className={css.chipsBlock}>
        <p className={css.subTitle}>
          <MetricIcon k="penalties" />
          {t('person.aiReportPenFor')}
        </p>
        {tm.penaltiesFor.length ? (
          <ul className={css.chips}>
            {tm.penaltiesFor.map((p) => (
              <li key={p.name} className={css.chip}>
                {p.name} <b>{p.penaltiesFor}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className={css.muted}>{t('person.aiReportNoPenFor')}</p>
        )}
      </div>
      <div className={css.chipsBlock}>
        <p className={css.subTitle}>{t('person.aiReportMostFrequent')}</p>
        <ul className={css.chips}>
          {tm.mostFrequent.slice(0, 4).map((f) => (
            <li key={f.name} className={css.chip}>
              {f.name} <b>{f.matches}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Panel({ title, sub, children, wide }: { title: string; sub?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`${css.panel} ${wide ? css.panelWide : ''}`}>
      <h3 className={css.panelTitle}>
        {title}
        {sub ? <span className={css.panelSub}>{sub}</span> : null}
      </h3>
      {children}
    </section>
  );
}

/**
 * Hakem sayfası "Hakem karnesi": grafikler koddaki metriklerden (`/api/referees/{id}/report` → `metrics`), üstte
 * modelin tek cümlelik başlığı ve 3-4 kısa içgörü. İstemcide çekilir; beklerken sahada ısınan dört hakem animasyonu.
 * Rapor yoksa / üretilemezse bölüm hiç görünmez.
 */
export default function RefereeAiReport({ refereeId }: { refereeId: number }) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const [data, setData] = useState<RefereeReportView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      fetch(`/api/referees/${refereeId}/report`)
        .then(async (r) => {
          const body = (await r.json().catch(() => null)) as RefereeReportResult | null;
          if (cancelled) return;
          if (r.ok && body?.status === 'ready') return setData(body.data);
          if (r.status === 202 && attempt < MAX_RETRIES) {
            timer = setTimeout(() => load(attempt + 1), RETRY_MS);
            return;
          }
          setFailed(true);
        })
        .catch(() => !cancelled && setFailed(true));
    };
    load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [refereeId]);

  if (failed) return null;
  const loc = locale === 'en' ? 'en-GB' : 'tr-TR';
  const fmt: Fmt = (n, digits = 2) => (n == null ? '—' : n.toLocaleString(loc, { maximumFractionDigits: digits }));
  const m = data?.metrics;
  const cs = m?.currentSeason;

  return (
    <section className={`${styles.card} ${css.card}`} aria-labelledby="ref-ai-report" aria-busy={data == null} data-testid="referee-ai-report">
      <h2 id="ref-ai-report" className={`${styles.sectionTitle} ${css.title}`}>
        <Whistle />
        {t('person.aiReportTitle')}
        <span className={css.aiBadge}>AI</span>
        {cs ? (
          <span className={styles.sectionSub}>
            {' '}
            · {cs.seasonName} {m?.mainLeague?.name} · {t('person.aiReportMatchesCount', { count: cs.matches })}
          </span>
        ) : null}
      </h2>
      {data == null || !m ? (
        <RefereeWarmup />
      ) : (
        <div className={css.body}>
          <div className={css.hero}>
            <p className={css.headline}>{data.report.headline}</p>
            {data.report.insights.length ? (
              <ul className={css.insights}>
                {data.report.insights.map((x, i) => (
                  <li key={i} style={{ ['--i' as string]: i }}>
                    <ToneIcon tone={x.tone} />
                    <span>{x.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className={css.grid}>
            {cs ? (
              <Panel title={t('person.aiReportVsLeague')}>
                <VsLeague m={cs} t={t} fmt={fmt} />
              </Panel>
            ) : null}
            {m.recent.pairs.length ? (
              <Panel title={t('person.aiReportRecent')} sub={t('person.aiReportMatchesCount', { count: m.recent.pairs.length })}>
                <Recent r={m.recent} t={t} fmt={fmt} />
              </Panel>
            ) : null}
            {m.trend.length > 1 ? (
              <Panel title={t('person.aiReportTrend')} sub={m.mainLeague?.name}>
                <Trend rows={m.trend} t={t} fmt={fmt} />
              </Panel>
            ) : null}
            {m.teams ? (
              <Panel title={t('person.aiReportTeams')} sub={t('person.aiReportTeamsSub', { season: m.teams.seasonName, count: m.teams.matchCount })}>
                <Teams tm={m.teams} t={t} fmt={fmt} />
              </Panel>
            ) : null}
          </div>
        </div>
      )}
      <p className={styles.note}>
        {t('person.aiReportNote')}
        {data ? ` · ${new Date(data.generatedAt).toLocaleDateString(loc, { timeZone: 'Europe/Istanbul' })}` : null}
      </p>
    </section>
  );
}
