/**
 * Takım sayfası SEO / GEO: sunucuda (ISR kabuğu) görünür "Takım hakkında" cümleleri + SportsTeam yapısal verisi.
 * Girdi yalnız kabuğun durağan bilgileri (bkz. server/teamPageShell.ts) — ek istek yok.
 */
import type { TeamPageFacts } from '@/server/teamPageShell';
import type { TeamCampaign } from '@/services/sportmonks/teamOverview';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';
import { leagueHubByLeagueId } from '@/config/leagueHubs';
import { siteBaseUrl } from '@/lib/siteUrl';

const nf = new Intl.NumberFormat('tr-TR');

export type TeamLeague = { id: number; name: string };

/**
 * Takımın ana ligi: güncel sezonda Sportmonks `sub_type: domestic` olan turnuva (kupa / Avrupa değil). Sunucu kabuğu ve
 * istemci aynı genel bakış yanıtından aynı sonucu çıkarır. Lig adı Türkçe kısa ad.
 */
export function primaryLeague(campaigns: TeamCampaign[] | null | undefined): TeamLeague | null {
  const s = campaigns?.[0]?.seasons.find((x) => x.leagueSubType === 'domestic');
  if (!s) return null;
  const name = leagueDisplayName(s.leagueId, s.leagueName);
  return name ? { id: s.leagueId, name } : null;
}

export const TEAM_TITLE_MAX = 60;
export const TEAM_DESCRIPTION_MAX = 155;

/**
 * Başlık (SEO 2026-11-22), 60 karaktere sığan ilk kademe: lig adıyla → ligsiz → kısa + marka → kısa. Sunucu kabuğu ve
 * istemci (TeamDetailView) AYNI işlevi kullanır (JS sonrası başlık değişmesin).
 */
export function teamPageTitle(name: string, league: TeamLeague | null, brand: (t: string) => string): string {
  const candidates = [
    ...(league ? [`${name} (${league.name}) Maçları, İstatistikleri ve Puan Durumu`] : []),
    `${name} Maçları, İstatistikleri ve Puan Durumu`,
    brand(`${name} Maçları ve Puan Durumu`),
    `${name} Maçları ve İstatistikleri`,
  ];
  return candidates.find((t) => t.length <= TEAM_TITLE_MAX) ?? candidates[candidates.length - 1]!;
}

export function teamPageDescription(name: string, league: TeamLeague | null, coach: string | null | undefined): string {
  const lig = league ? ` (${league.name})` : '';
  const table = league ? `güncel ${league.name} puan durumu` : 'puan durumu';
  const candidates = [
    `${name}${lig} maçları, sonuçları ve fikstürü; oyuncu istatistikleri, kadro ve ${table}.${coach ? ` Teknik direktör: ${coach}.` : ''}`,
    `${name}${lig} maçları, sonuçları ve fikstürü; oyuncu istatistikleri, kadro ve ${table}.`,
    `${name} maçları, sonuçları, fikstürü, istatistikleri ve puan durumu.`,
  ];
  return candidates.find((t) => t.length <= TEAM_DESCRIPTION_MAX) ?? candidates[candidates.length - 1]!;
}

export function buildTeamSummary(name: string, f: TeamPageFacts | null | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  if (f.league) out.push(`${name}, ${f.league.name} takımı.`);
  if (f.standing && f.league) {
    out.push(
      `${f.standing.asOf} itibarıyla ${f.league.name} puan durumunda ${f.standing.rank}. sırada: ${f.standing.played} maçta ${f.standing.points} puan (${f.standing.won} galibiyet, ${f.standing.drawn} beraberlik, ${f.standing.lost} mağlubiyet; averaj ${f.standing.goalDiff > 0 ? '+' : ''}${f.standing.goalDiff}).`,
    );
  }
  if (f.season) {
    out.push(`${name}, ${f.season.name} sezonunda ${f.season.competitions.join(', ')} ${f.season.competitions.length > 1 ? 'turnuvalarında' : 'turnuvasında'} mücadele ediyor.`);
  }
  if (f.coach) out.push(`Teknik direktör: ${f.coach}.`);
  if (f.venue) {
    const parts = [f.venue.city, f.venue.capacity ? `${nf.format(f.venue.capacity)} kişilik` : null].filter(Boolean);
    out.push(`Stadyum: ${f.venue.name}${parts.length ? ` (${parts.join(', ')})` : ''}.`);
  }
  if (out.length) {
    out.push(`Bu sayfada ${name} takımının son maç sonuçları, fikstürü, kadrosu, sezon istatistikleri ve puan durumu yer alır.`);
  }
  return out;
}

export function teamJsonLd(name: string, url: string, f: TeamPageFacts | null | undefined, ogImage: string | null): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    name,
    url,
    sport: 'Soccer',
    ...(f?.logo ? { logo: f.logo } : {}),
    ...(ogImage ? { image: ogImage } : {}),
    ...(f?.coach ? { coach: { '@type': 'Person', name: f.coach } } : {}),
    ...(f?.venue
      ? { location: { '@type': 'StadiumOrArena', name: f.venue.name, ...(f.venue.city ? { address: f.venue.city } : {}) } }
      : {}),
    ...(f?.season
      ? {
          memberOf: f.season.competitions.map((c, i) => {
            const hub = leagueHubByLeagueId(f.season!.leagueIds?.[i]);
            return { '@type': 'SportsOrganization', name: c, ...(hub ? { url: `${siteBaseUrl()}/lig/${hub.slug}` } : {}) };
          }),
        }
      : {}),
    ...(f?.xUrl ? { sameAs: [f.xUrl] } : {}),
  };
}
