import Link from 'next/link';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { buildMatchHref } from '@/utils/matchUrl';
import { weightedRates } from '@/utils/refereeAverages';
import { UEFA_CLUB_LEAGUE_IDS } from '@/config/refereeTableLeagues';
import type { RefereePageData } from '@/server/people/refereePage';
import { personLeagueLabel } from './leagueLabel';
import styles from './personPage.module.scss';

/** UTC `date` + `scheduled` → "24.11.2026 · 20:00" (TSİ). */
export function trKickoff(date?: string, time?: string): string {
  if (!date) return '';
  const ms = Date.parse(`${date}T${time ?? '00:00'}:00Z`);
  if (!Number.isFinite(ms)) return date;
  const parts = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(ms);
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? '';
  return `${get('day')}.${get('month')}.${get('year')}${time ? ` · ${get('hour')}:${get('minute')}` : ''}`;
}

const RATE_KEYS = [
  ['yellow', 'person.colYellowPm'],
  ['red', 'person.colRedPm'],
  ['penalties', 'person.colPenPm'],
  ['var', 'person.colVarPm'],
] as const;

/** UEFA kulüp turnuvaları özeti (sezon tablosundan; ek istek yok). */
export function uefaCareer(seasons: RefereePageData['seasons']) {
  const rows = seasons.filter((r) => r.leagueId != null && UEFA_CLUB_LEAGUE_IDS.has(r.leagueId));
  if (!rows.length) return null;
  const byLeague = new Map<number, number>();
  for (const r of rows) byLeague.set(r.leagueId!, (byLeague.get(r.leagueId!) ?? 0) + r.matches);
  return {
    matches: rows.reduce((n, r) => n + r.matches, 0),
    seasons: new Set(rows.map((r) => r.seasonName)).size,
    rates: weightedRates(rows),
    byLeague: [...byLeague.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/**
 * Hakem sayfası sağ paneli (masaüstünde profilin yanında, mobilde altında): sıradaki görevler, UEFA kariyeri, özet
 * bağlamındaki lig ortalamasıyla yan yana çubuklar, hakem tablolarına link. Yalnız sayılar; "üstünde / altında" yorumu yok.
 */
export default function RefereeProfileSide({ data, compareHref }: { data: RefereePageData; compareHref: string }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null | undefined) => (n == null ? '—' : nf.format(n));
  const uefa = uefaCareer(data.seasons);
  const ctx = data.summary.context;
  const ctxLabel = ctx ? `${personLeagueLabel(ctx.leagueId, tl, '')} ${ctx.seasonName}`.trim() : '';

  return (
    <aside className={styles.side} aria-label={t('person.refereeRole')} data-testid="referee-profile-side">
      {data.upcoming?.length ? (
        <section className={styles.card} aria-labelledby="side-upcoming" data-testid="referee-upcoming">
          <h2 id="side-upcoming" className={styles.sectionTitle}>
            {t('person.upcomingTitle')}
          </h2>
          <ul className={styles.sideList}>
            {data.upcoming.map((m) => (
              <li key={m.id} className={styles.sideListItem}>
                <Link href={buildMatchHref({ id: m.id, home_name: m.home.name, away_name: m.away.name })} className={styles.sideMatch} prefetch={false}>
                  <TeamLogo src={m.home.logo} width={16} />
                  {m.home.name}
                  <span aria-hidden="true">–</span>
                  <TeamLogo src={m.away.logo} width={16} />
                  {m.away.name}
                </Link>
                <span className={styles.sideMeta}>
                  {m.date ? <span>{trKickoff(m.date, m.scheduled)}</span> : null}
                  <span>{personLeagueLabel(m.competition?.id, tl, m.competition?.name || '')}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {uefa ? (
        <section className={styles.card} aria-labelledby="side-uefa" data-testid="referee-uefa">
          <h2 id="side-uefa" className={styles.sectionTitle}>
            {t('person.uefaTitle')}
          </h2>
          <div className={styles.sideBody}>
            <p className={styles.sideSub}>{t('person.uefaSub', { count: uefa.matches, seasons: uefa.seasons })}</p>
            <dl className={styles.sideStats}>
              {RATE_KEYS.map(([k, label]) => (
                <div key={k}>
                  <dt>{t(label)}</dt>
                  <dd>{fmt(uefa.rates[k])}</dd>
                </div>
              ))}
            </dl>
            <p className={styles.sideSub}>
              {uefa.byLeague.map(([id, n]) => `${personLeagueLabel(id, tl)} ${t('person.seasonMatches', { count: n })}`).join(' · ')}
            </p>
          </div>
          <p className={styles.note}>{t('person.uefaNote')}</p>
        </section>
      ) : null}

      {ctx?.leagueAvg ? (
        <section className={styles.card} aria-labelledby="side-vs">
          <h2 id="side-vs" className={styles.sectionTitle}>
            {t('person.vsLeagueTitle')}
            <span className={styles.sectionSub}> · {ctxLabel}</span>
          </h2>
          <div className={styles.sideBody}>
            {RATE_KEYS.map(([k, label]) => {
              const v = ctx.rates[k];
              const avg = ctx.leagueAvg![k];
              const max = Math.max(v ?? 0, avg ?? 0) * 1.25 || 1;
              return (
                <div key={k} className={styles.vsRow} role="group" aria-label={`${t(label)}: ${fmt(v)}, ${t('person.sideLeagueAvgShort', { value: fmt(avg) })}`}>
                  <div className={styles.vsHead}>
                    <span>{t(label)}</span>
                    <span>
                      <strong>{fmt(v)}</strong> · {t('person.sideLeagueAvgShort', { value: fmt(avg) })}
                    </span>
                  </div>
                  <div className={styles.vsTrack} aria-hidden="true">
                    <span className={styles.vsFill} style={{ width: `${((v ?? 0) / max) * 100}%` }} />
                    {avg != null ? <span className={styles.vsMark} style={{ left: `calc(${(avg / max) * 100}% - 1px)` }} /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className={styles.card} aria-labelledby="side-tables">
        <h2 id="side-tables" className={styles.sectionTitle}>
          {t('person.tableLinkTitle')}
        </h2>
        <div className={styles.sideBody}>
          <Link href={compareHref} className={styles.sideLink} prefetch={false}>
            {t('person.compareWith')}
          </Link>
          <Link href="/hakemler" className={styles.sideLink} prefetch={false}>
            {t('person.tableLinkText')}
          </Link>
        </div>
      </section>
    </aside>
  );
}
