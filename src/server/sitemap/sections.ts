/**
 * Sitemap bölümleri (SEO raporu 2026-11-16: türlere böl + lastmod + sezonun bütün Süper Lig / 1. Lig maçları).
 * `/sitemap.xml` dizin; bölümler `/sitemaps/{ad}.xml`. Her bölüm CDN'de 1 gün (üretim günde ~1 kez / bölge).
 * Hata bölümü düşürmez (eksik liste). İstek kaynakları: maç listesi (±3 gün, ana sayfayla aynı önbellek), League / Round /
 * Stage havuzları (sezon programı, haftalar) — sezon maçları için Fixture havuzuna sitemap'ten istek gitmez.
 */
import { siteBaseUrl } from '@/lib/siteUrl';
import { gameSitemapRoutes } from '@/config/gameFlag';
import { hubHasWeeks, LEAGUE_HUBS } from '@/config/leagueHubs';
import { buildMatchSlug } from '@/utils/matchUrl';
import { teamHref } from '@/utils/teamUrl';

export type SitemapUrl = { loc: string; lastmod?: string; changefreq?: string; priority?: string };
export const SITEMAP_SECTIONS = ['sayfalar', 'maclar', 'takimlar', 'kisiler'] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

/** Sezonun bütün maçları sitemap'te olan ligler (Süper Lig, 1. Lig). */
export const SEASON_SITEMAP_LEAGUE_IDS = [600, 603] as const;

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

function isoDateOffset(now: number, days: number): string {
  return day(now + days * 86_400_000);
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function buildUrlsetXml(urls: SitemapUrl[]): string {
  const seen = new Set<string>();
  const entries = urls
    .filter((u) => (seen.has(u.loc) ? false : (seen.add(u.loc), true)))
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}${
          u.changefreq ? `\n    <changefreq>${u.changefreq}</changefreq>` : ''
        }${u.priority ? `\n    <priority>${u.priority}</priority>` : ''}\n  </url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export function buildIndexXml(baseUrl: string, now: number): string {
  const today = day(now);
  const entries = SITEMAP_SECTIONS.map((s) => `  <sitemap>\n    <loc>${baseUrl}/sitemaps/${s}.xml</loc>\n    <lastmod>${today}</lastmod>\n  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>`;
}

const STATIC_ROUTES: { path: string; priority: string; changefreq: string; daily?: boolean }[] = [
  { path: '/', priority: '1.0', changefreq: 'hourly', daily: true },
  { path: '/bugun', priority: '0.7', changefreq: 'hourly', daily: true },
  { path: '/lig', priority: '0.7', changefreq: 'weekly' },
  { path: '/hakemler', priority: '0.7', changefreq: 'daily', daily: true },
  { path: '/ai-istatistikleri', priority: '0.6', changefreq: 'daily', daily: true },
  { path: '/hakkimizda', priority: '0.4', changefreq: 'monthly' },
  { path: '/yontem', priority: '0.4', changefreq: 'monthly' },
  { path: '/gundem', priority: '0.5', changefreq: 'hourly', daily: true },
  { path: '/frikik', priority: '0.4', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.7', changefreq: 'monthly' },
  { path: '/hesap-silme', priority: '0.3', changefreq: 'yearly' },
];

/** Sabit sayfalar + lig sayfaları + hafta sayfaları (bitmiş hafta lastmod = bitiş günü). */
export async function pagesSection(now: number): Promise<SitemapUrl[]> {
  const base = siteBaseUrl();
  const today = day(now);
  const out: SitemapUrl[] = [
    ...STATIC_ROUTES.map((r) => ({ loc: `${base}${r.path}`, priority: r.priority, changefreq: r.changefreq, ...(r.daily ? { lastmod: today } : {}) })),
    ...gameSitemapRoutes().map((r) => ({ loc: `${base}${r.path}`, priority: r.priority, changefreq: r.changefreq })),
    ...LEAGUE_HUBS.map((h) => ({ loc: `${base}/lig/${h.slug}`, priority: '0.8', changefreq: 'daily', lastmod: today })),
  ];
  try {
    const { loadCurrentSeason, loadSeasonRounds } = await import('@/server/leagueWeeks');
    const weekLists = await Promise.all(
      LEAGUE_HUBS.filter(hubHasWeeks).map(async (h) => {
        const season = await loadCurrentSeason(h.leagueId).catch(() => null);
        const rounds = season ? await loadSeasonRounds(season.id).catch(() => []) : [];
        // Yalnız başlamış haftalar + sıradaki bir hafta (uzak gelecek hafta ince sayfa).
        const started = rounds.filter((r) => r.start != null && r.start <= isoDateOffset(now, 7));
        return started.map((r) => ({
          loc: `${base}/lig/${h.slug}/hafta/${r.week}`,
          priority: '0.6',
          changefreq: r.finished ? 'monthly' : 'daily',
          lastmod: r.finished && r.end ? r.end.slice(0, 10) : today,
        }));
      }),
    );
    out.push(...weekLists.flat());
  } catch {
    // hafta sayfaları olmadan da çalışır
  }
  return out;
}

type MatchLike = Parameters<typeof buildMatchSlug>[0] & { id: number | string; status?: string; date?: string };

function matchUrl(base: string, m: MatchLike, lastmod: string): SitemapUrl {
  const slug = buildMatchSlug(m);
  return { loc: `${base}${slug ? `/matches/${m.id}-${slug}` : `/matches/${m.id}`}`, lastmod, changefreq: 'daily', priority: '0.6' };
}

/** ±3 gün maç listesi + milli maçlar + Süper Lig / 1. Lig sezonunun bütün maçları. */
export async function matchesSection(now: number): Promise<{ matches: SitemapUrl[]; teams: Map<number, string> }> {
  const base = siteBaseUrl();
  const today = day(now);
  const dates = [-3, -2, -1, 0, 1, 2, 3].map((o) => isoDateOffset(now, o));
  const matches: SitemapUrl[] = [];
  // Takım id → ad (kanonik /teams/{id}-{ad} adresi için).
  const teams = new Map<number, string>();
  const addTeam = (id: unknown, name: unknown) => {
    const n = Number(id);
    if (n > 0 && !teams.has(n)) teams.set(n, typeof name === 'string' ? name : '');
  };
  try {
    const { getFixturesByDate } = await import('@/services/liveScoreService');
    const lists = await Promise.all(dates.map((d) => getFixturesByDate(d).catch(() => [])));
    for (const list of lists) {
      for (const m of list) {
        matches.push(matchUrl(base, m as MatchLike, m.date && m.date < today ? m.date : today));
        addTeam(m.home?.id ?? m.home_id, m.home?.name);
        addTeam(m.away?.id ?? m.away_id, m.away?.name);
      }
    }
  } catch {
    // yok say
  }
  try {
    const { nationalMatchesEnabled } = await import('@/config/nationalMatches');
    if (nationalMatchesEnabled()) {
      const { loadNationalDay } = await import('@/server/apiFootball/nationalDay');
      const days = await Promise.all(dates.map((d) => loadNationalDay(d)));
      for (const d of days) {
        if (!d.ok) continue;
        for (const m of d.matches) {
          matches.push(matchUrl(base, m as unknown as MatchLike, today));
          for (const t of [m.home, m.away]) if (t?.id != null) addTeam(t.id, t.name);
        }
      }
    }
  } catch {
    // yok say
  }
  try {
    const { loadCurrentSeason, loadSeasonFixtureHrefs } = await import('@/server/leagueWeeks');
    const seasons = await Promise.all(SEASON_SITEMAP_LEAGUE_IDS.map((id) => loadCurrentSeason(id).catch(() => null)));
    const lists = await Promise.all(seasons.map((s) => (s ? loadSeasonFixtureHrefs(s.id).catch(() => []) : [])));
    for (const list of lists) {
      for (const f of list) {
        for (const t of f.teams) addTeam(t.id, t.name);
        // Gelecek maçlar sitemap'e ±3 gün listesiyle girer; sezon listesinden yalnız oynanmış ya da 7 gün içindekiler.
        if (f.kickoff != null && f.kickoff > now + 7 * 86_400_000) continue;
        matches.push({ loc: `${base}${f.href}`, lastmod: f.kickoff != null && f.kickoff < now ? day(f.kickoff + 3 * 3_600_000) : today, changefreq: 'weekly', priority: '0.5' });
      }
    }
  } catch {
    // yok say
  }
  return { matches, teams };
}

export async function teamsSection(now: number): Promise<SitemapUrl[]> {
  const base = siteBaseUrl();
  const today = day(now);
  const { teams } = await matchesSection(now);
  return [...teams].map(([id, name]) => ({ loc: `${base}${teamHref(id, name)}`, lastmod: today, changefreq: 'daily', priority: '0.5' }));
}

export async function peopleSection(): Promise<SitemapUrl[]> {
  const base = siteBaseUrl();
  try {
    const { loadSitemapPeoplePaths, refereeTableSitemapPaths } = await import('@/server/people/sitemapPeople');
    return [
      ...refereeTableSitemapPaths().map((p) => ({ loc: `${base}${p}`, priority: '0.6', changefreq: 'daily' })),
      ...(await loadSitemapPeoplePaths()).map((p) => ({ loc: `${base}${p}`, priority: '0.4', changefreq: 'weekly' })),
    ];
  } catch {
    return [];
  }
}

export async function buildSectionXml(section: SitemapSection, now: number): Promise<string> {
  switch (section) {
    case 'sayfalar':
      return buildUrlsetXml(await pagesSection(now));
    case 'maclar':
      return buildUrlsetXml((await matchesSection(now)).matches);
    case 'takimlar':
      return buildUrlsetXml(await teamsSection(now));
    case 'kisiler':
      return buildUrlsetXml(await peopleSection());
  }
}
