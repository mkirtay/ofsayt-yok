/**
 * Maç seçimi (saf): haftalık admin önerilerinin sırası ve günlük oyunun ("Günün 3 maçı") otomatik seçimi. DB / ağ yok →
 * tablo testli (selection.test.ts). Girdi ana sayfayla aynı önbellekli gün listeleri (`fixtures/date/{d}`); yeni istek türü yok.
 */
import type { Match } from '@/models/liveScore';
import { matchKickoffMs } from '@/utils/matchActivity';

/** Haftalık öneri önceliği: Süper Lig, UEFA kupaları, beş büyük lig, Türkiye Kupası / 1. Lig. Listede olmayan ligler sona. */
export const LEAGUE_PRIORITY: readonly number[] = [600, 2, 5, 2286, 8, 564, 384, 82, 301, 606, 603];

/**
 * Günlük öncelik kademeleri (kullanıcı kararı 2026-10-19): Süper Lig → beş büyük lig → Avrupa kupaları → alt seviye
 * (1. Lig, Türkiye Kupası, Hollanda, Portekiz, Belçika, İskoçya, ikinci ligler …). Kademede yer almayan ligler en sonda.
 */
export const DAILY_TIERS: readonly (readonly number[])[] = [
  [600],
  [8, 564, 384, 82, 301],
  [2, 5, 2286],
  [603, 606, 72, 462, 208, 501, 9, 85, 304, 387, 567, 570, 325, 591],
];

/**
 * Büyük takımlar (Sportmonks takım id): Süper Lig'in büyükleri + Avrupa devleri. Aynı kademede büyük takım içeren maç öne
 * alınır (iki büyük takım = derbi en önde).
 */
export const BIG_TEAM_IDS: ReadonlySet<number> = new Set([
  34, 88, 554, 688, // Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor
  3468, 83, 7980, // Real Madrid, Barcelona, Atlético
  9, 8, 19, 18, 14, 6, // Man City, Liverpool, Arsenal, Chelsea, Man United, Tottenham
  503, 68, 3321, // Bayern, Dortmund, Leverkusen
  2930, 113, 625, 597, // Inter, Milan, Juventus, Napoli
  591, // PSG
]);

export type Candidate = { fixtureId: string; kickoffMs: number; leagueId: number | null; leagueName: string; home: string; away: string; big: number };

const teamId = (t: Match['home'] | undefined, fallback: number | undefined) => {
  const n = Number((t as { id?: unknown } | undefined)?.id ?? fallback);
  return Number.isFinite(n) ? n : null;
};

/** Pencere içinde ve henüz başlamamış (durum kodu yok, saat belli) maçlar; fixture başına tek aday. */
export function candidatesIn(matches: readonly Match[], startsAt: Date, endsAt: Date, now: Date): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const m of matches) {
    const k = matchKickoffMs(m);
    if (k == null || k <= now.getTime() || k < startsAt.getTime() || k >= endsAt.getTime()) continue;
    if (m.state_code || m.time_tbd) continue;
    const leagueId = m.competition_id ?? (m.competition?.id != null ? Number(m.competition.id) : null);
    const big = [teamId(m.home, m.home_id), teamId(m.away, m.away_id)].filter((id) => id != null && BIG_TEAM_IDS.has(id)).length;
    out.set(String(m.id), {
      fixtureId: String(m.id),
      kickoffMs: k,
      leagueId,
      leagueName: m.competition?.name ?? m.competition_name ?? '',
      home: m.home?.name ?? m.home_name ?? '',
      away: m.away?.name ?? m.away_name ?? '',
      big,
    });
  }
  return [...out.values()];
}

const prioOf = (leagueId: number | null) => {
  const i = leagueId != null ? LEAGUE_PRIORITY.indexOf(leagueId) : -1;
  return i === -1 ? LEAGUE_PRIORITY.length : i;
};

/** Haftalık öneri sırası: büyük takım sayısı ↓, lig önceliği, başlama saati. */
export function rankWeekly(cands: readonly Candidate[]): Candidate[] {
  return [...cands].sort((a, b) => b.big - a.big || prioOf(a.leagueId) - prioOf(b.leagueId) || a.kickoffMs - b.kickoffMs);
}

const tierOf = (leagueId: number | null) => {
  const i = leagueId == null ? -1 : DAILY_TIERS.findIndex((t) => t.includes(leagueId));
  return i === -1 ? DAILY_TIERS.length : i;
};

/**
 * Günün maçları: kademe sırasıyla (Süper Lig → büyük 5 → kupalar → alt seviye → diğer), kademe içinde büyük takım ↓ ve erken
 * başlayan önce; en çok `count`. Kademeye girmeyen ligler yalnız başka aday yoksa.
 */
export function pickDaily(cands: readonly Candidate[], count = 3): Candidate[] {
  return [...cands].sort((a, b) => tierOf(a.leagueId) - tierOf(b.leagueId) || b.big - a.big || a.kickoffMs - b.kickoffMs).slice(0, count);
}
