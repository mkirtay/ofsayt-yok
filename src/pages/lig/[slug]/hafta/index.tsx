import type { GetServerSideProps } from 'next';
import { hubHasWeeks, leagueHubBySlug } from '@/config/leagueHubs';

/** /lig/{slug}/hafta → güncel hafta (geçici yönlendirme; CDN 30 dk). "Bu hafta hakem atamaları" bağlantılarının hedefi. */
export const getServerSideProps: GetServerSideProps = async ({ params, res }) => {
  const hub = leagueHubBySlug(String(params?.slug ?? ''));
  if (!hub || !hubHasWeeks(hub)) return { notFound: true };
  const { loadCurrentSeason, loadSeasonRounds, pickCurrentRound } = await import('@/server/leagueWeeks');
  try {
    const season = await loadCurrentSeason(hub.leagueId);
    const rounds = season ? await loadSeasonRounds(season.id) : [];
    const cur = pickCurrentRound(rounds, new Date().toISOString().slice(0, 10));
    if (!cur) return { redirect: { destination: `/lig/${hub.slug}`, permanent: false } };
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
    return { redirect: { destination: `/lig/${hub.slug}/hafta/${cur.week}`, permanent: false } };
  } catch {
    return { redirect: { destination: `/lig/${hub.slug}`, permanent: false } };
  }
};

export default function CurrentWeekRedirect() {
  return null;
}
