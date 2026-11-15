/**
 * Takım sayfası SEO / GEO: sunucuda (ISR kabuğu) görünür "Takım hakkında" cümleleri + SportsTeam yapısal verisi.
 * Girdi yalnız kabuğun durağan bilgileri (bkz. server/teamPageShell.ts) — ek istek yok.
 */
import type { TeamPageFacts } from '@/server/teamPageShell';

const nf = new Intl.NumberFormat('tr-TR');

/** Başlık / açıklama: sunucu kabuğu ve istemci (TeamDetailView) AYNI metni kullanır (JS sonrası başlık değişmesin). */
export function teamPageTitleText(name: string): string {
  return `${name}: Maç Sonuçları, Fikstür ve Kadro`;
}

export function teamPageDescriptionText(name: string): string {
  return `${name} son maç sonuçları, fikstürü, kadrosu, puan durumu ve sezon istatistikleri.`;
}

export function buildTeamSummary(name: string, f: TeamPageFacts | null | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
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
    ...(f?.season ? { memberOf: f.season.competitions.map((c) => ({ '@type': 'SportsOrganization', name: c })) } : {}),
    ...(f?.xUrl ? { sameAs: [f.xUrl] } : {}),
  };
}
