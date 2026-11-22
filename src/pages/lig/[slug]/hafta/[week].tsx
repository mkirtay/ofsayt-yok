import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import { hubHasWeeks, leagueHubBySlug, type LeagueHub } from '@/config/leagueHubs';
import { brandTitle } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import type { RefereeSplit, SeasonRound, WeekFixture } from '@/server/leagueWeeks';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import { refereeHref } from '@/utils/personUrl';
import { buildWeekSummary, weekDateRange } from '@/utils/leagueWeekSeo';
import styles from '../../lig.module.scss';
import { clampDescription } from '@/utils/seoText';

type Props = {
  hub: LeagueHub;
  seasonName: string;
  round: SeasonRound;
  fixtures: WeekFixture[];
  weeks: number[];
  currentWeek: number | null;
  /** Haftanın hakemlerinin sezon karnesi (önceki haftalardan); yoksa boş. */
  refereeSplits?: RefereeSplit[];
};

/**
 * Lig hafta sayfası (SEO raporu 2026-11-16): "Süper Lig 12. hafta maçları, sonuçları ve hakemleri". ISR; istekler Round /
 * League havuzundan (Fixture değil), bkz. server/leagueWeeks.ts. Bitmiş hafta 7 gün, süren / yaklaşan hafta 30 dk.
 */
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const hub = leagueHubBySlug(String(params?.slug ?? ''));
  const week = Number(params?.week);
  if (!hub || !hubHasWeeks(hub) || !Number.isInteger(week) || week < 1 || week > 60) return { notFound: true, revalidate: 86_400 };
  const [{ loadCurrentSeason, loadSeasonRounds, loadRoundFixtures, pickCurrentRound, loadRefereeSeasonSplits }, { withSportmonksTimeout, SPORTMONKS_TIMEOUT_MS }, { propsJsonSafe }] =
    await Promise.all([import('@/server/leagueWeeks'), import('@/server/sportmonks/cachedFetch'), import('@/server/propsJsonSafe')]);
  const t = <T,>(fn: () => Promise<T>) => withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, fn);
  const season = await t(() => loadCurrentSeason(hub.leagueId));
  if (!season) throw new Error(`hafta sayfası: sezon yok ${hub.slug}`);
  const rounds = await t(() => loadSeasonRounds(season.id));
  const round = rounds.find((r) => r.week === week);
  if (!round) return { notFound: true, revalidate: 3600 };
  const fixtures = await t(() => loadRoundFixtures(round.id));
  const today = new Date().toISOString().slice(0, 10);
  const settled = round.finished && round.end != null && round.end < today;
  // Büyüme raporu 2.1: haftanın hakemlerinin sezon karnesi (önceki bitmiş haftalardan; kart ev/dep + sonuç dağılımı).
  let refereeSplits: RefereeSplit[] = [];
  try {
    const ids = new Set(fixtures.map((f) => f.referee?.id).filter((x): x is number => x != null));
    if (ids.size) {
      const all = await t(() => loadRefereeSeasonSplits(rounds.filter((r) => r.week < round.week)));
      refereeSplits = [...all.values()].filter((s) => ids.has(s.refereeId));
    }
  } catch {
    refereeSplits = [];
  }
  return {
    props: propsJsonSafe({
      hub,
      seasonName: season.name,
      round,
      fixtures,
      weeks: rounds.map((r) => r.week),
      currentWeek: pickCurrentRound(rounds, today)?.week ?? null,
      refereeSplits,
    }),
    revalidate: settled ? 7 * 86_400 : 1800,
  };
};

const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function LeagueWeekPage({ hub, seasonName, round, fixtures, weeks, currentWeek, refereeSplits = [] }: Props) {
  const url = `${siteBaseUrl()}/lig/${hub.slug}/hafta/${round.week}`;
  const heading = `${hub.name} ${round.week}. Hafta Maçları, Sonuçları ve Hakemleri`;
  const summary = buildWeekSummary(hub.name, seasonName, round, fixtures);
  const title = brandTitle(`${hub.name} ${round.week}. Hafta Maçları ve Hakemleri (${seasonName})`);
  const description = `${summary[0] ?? ''} Maç saatleri, skorlar ve hakem atamaları.`.trim();
  const prev = weeks.includes(round.week - 1) ? round.week - 1 : null;
  const next = weeks.includes(round.week + 1) ? round.week + 1 : null;

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={clampDescription(description)} key="description" />
        <link rel="canonical" href={url} key="canonical" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={clampDescription(description)} key="og:description" />
        <meta property="og:url" content={url} key="og:url" />
      </Head>
      <JsonLd
        schema={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: heading,
          itemListElement: fixtures.map((f, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'SportsEvent',
              name: `${f.home.name} - ${f.away.name}`,
              url: `${siteBaseUrl()}${f.href}`,
              sport: 'Soccer',
              ...(f.kickoff ? { startDate: new Date(f.kickoff).toISOString() } : {}),
              homeTeam: { '@type': 'SportsTeam', name: f.home.name },
              awayTeam: { '@type': 'SportsTeam', name: f.away.name },
            },
          })),
        }}
      />
      <JsonLd
        schema={breadcrumbJsonLd([
          { name: 'Ligler', url: `${siteBaseUrl()}/lig` },
          { name: hub.name, url: `${siteBaseUrl()}/lig/${hub.slug}` },
          { name: `${round.week}. hafta`, url },
        ])}
      />

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{heading}</h1>
          <p className={styles.meta}>
            {seasonName} · {weekDateRange(round)}
          </p>
        </div>
      </header>

      {summary.length ? <p className={styles.summary}>{summary.join(' ')}</p> : null}

      <section className={styles.section} aria-labelledby="hafta-maclari">
        <h2 id="hafta-maclari" className={styles.sectionTitle}>
          {round.week}. hafta maç programı ve hakemler
        </h2>
        {fixtures.length ? (
          <div className={styles.tableWrap}>
            <table className={styles.weekTable}>
              <thead>
                <tr>
                  <th scope="col">Tarih (TSİ)</th>
                  <th scope="col">Maç</th>
                  <th scope="col">Skor</th>
                  <th scope="col">Hakem</th>
                  <th scope="col" title="Sarı / kırmızı kart">Kart</th>
                </tr>
              </thead>
              <tbody>
                {fixtures.map((f) => (
                  <tr key={f.id}>
                    <td className={styles.nowrap}>{f.kickoff ? timeFmt.format(new Date(f.kickoff)) : '—'}</td>
                    <td>
                      <Link href={f.href} prefetch={false}>
                        {f.home.name} - {f.away.name}
                      </Link>
                    </td>
                    <td className={styles.nowrap}>{f.score && f.state !== 'NS' ? f.score : '—'}</td>
                    <td>
                      {f.referee ? (
                        <Link href={refereeHref(f.referee.id, f.referee.name)} prefetch={false}>
                          {f.referee.name}
                        </Link>
                      ) : (
                        'Açıklanmadı'
                      )}
                    </td>
                    <td className={styles.nowrap}>
                      {f.cards ? (
                        <span aria-label={`${f.cards.yellow} sarı, ${f.cards.red} kırmızı kart`}>
                          🟨 {f.cards.yellow}
                          {f.cards.red ? ` 🟥 ${f.cards.red}` : ''}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={styles.empty}>Bu haftanın maç programı henüz açıklanmadı.</p>
        )}
      </section>

      {refereeSplits.length ? <RefereeReportSection hubName={hub.name} week={round.week} fixtures={fixtures} splits={refereeSplits} /> : null}

      <nav className={styles.more} aria-label="Haftalar">
        {prev ? <Link href={`/lig/${hub.slug}/hafta/${prev}`}>← {prev}. hafta</Link> : null}
        {prev && next ? ' · ' : null}
        {next ? <Link href={`/lig/${hub.slug}/hafta/${next}`}>{next}. hafta →</Link> : null}
        {currentWeek && currentWeek !== round.week ? (
          <>
            {' · '}
            <Link href={`/lig/${hub.slug}/hafta/${currentWeek}`}>Bu hafta ({currentWeek}. hafta)</Link>
          </>
        ) : null}
        {' · '}
        <Link href={`/lig/${hub.slug}`}>{hub.name} puan durumu</Link>
        {' · '}
        <Link href="/hakemler">Hakem istatistikleri</Link>
      </nav>
    </Container>
  );
}

const num = (v: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

/**
 * Büyüme raporu 2.1 — "Haftanın hakem atamaları" karnesi: atanan hakemin bu ligde bu sezon (önceki haftalar) maç başına
 * sarı kart, ev sahibi / deplasman sarı kartı, kırmızı ve sonuç dağılımı. "En çok" dili yok (hakem içeriği kuralı).
 */
function RefereeReportSection({ hubName, week, fixtures, splits }: { hubName: string; week: number; fixtures: WeekFixture[]; splits: RefereeSplit[] }) {
  const byId = new Map(splits.map((s) => [s.refereeId, s]));
  const rows = fixtures.filter((f) => f.referee && byId.has(f.referee.id));
  return (
    <section className={styles.section} aria-labelledby="hakem-karnesi">
      <h2 id="hakem-karnesi" className={styles.sectionTitle}>
        {week}. hafta hakem atamaları: bu sezonki karneleri
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.weekTable}>
          <thead>
            <tr>
              <th scope="col">Hakem · maç</th>
              <th scope="col">Maç</th>
              <th scope="col">Sarı / maç</th>
              <th scope="col">Ev – dep. sarı</th>
              <th scope="col">Kırmızı / maç</th>
              <th scope="col">Ev / ber. / dep.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const s = byId.get(f.referee!.id)!;
              return (
                <tr key={f.id}>
                  <td>
                    <Link href={refereeHref(f.referee!.id, f.referee!.name)} prefetch={false}>
                      {f.referee!.name}
                    </Link>
                    <span className={styles.subMeta}>
                      {f.home.name} - {f.away.name}
                    </span>
                  </td>
                  <td>{s.matches}</td>
                  <td>{num(s.yellowPerMatch)}</td>
                  <td className={styles.nowrap}>
                    {num(s.homeYellowPerMatch)} – {num(s.awayYellowPerMatch)}
                  </td>
                  <td>{num(s.redPerMatch)}</td>
                  <td className={styles.nowrap}>
                    %{s.homeWinPct} / %{s.drawPct} / %{s.awayWinPct}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        {hubName} bu sezon, {week}. haftadan önceki maçlar. Ev – dep. sarı: o hakemin maçlarında ev sahibine ve deplasmana
        gösterilen maç başına sarı kart. Ev / ber. / dep.: sonuç dağılımı. Veri: Sportmonks.
      </p>
    </section>
  );
}
