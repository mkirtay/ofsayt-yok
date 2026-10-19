/**
 * Maç seçimi (saf): haftalık admin önerilerinin sırası (ilk 10 = otomatik öneri) ve günlük oyunun ("Günün 3 maçı") otomatik
 * seçimi. Öncelik ve sınırlar config/gameMatchPriority.ts'te (tek kaynak). DB / ağ yok → tablo testli (selection.test.ts).
 * Girdi ana sayfayla aynı önbellekli gün listeleri (`fixtures/date/{d}`); yeni istek türü yok.
 */
import type { Match } from '@/models/liveScore';
import { matchKickoffMs } from '@/utils/matchActivity';
import {
  DAILY_LIMITS,
  EURO_GIANT_EXTRA_IDS,
  EURO_GIANT_IDS,
  LEAGUE_ORDER,
  TOP_LEAGUE_IDS,
  TURKEY_BIG_TEAM_IDS,
  TURKISH_LEAGUE_IDS,
  UEFA_IDS,
  WEEKLY_LIMITS,
  type DiversityLimits,
} from '@/config/gameMatchPriority';

export type Candidate = {
  fixtureId: string;
  kickoffMs: number;
  leagueId: number | null;
  leagueName: string;
  home: string;
  away: string;
  homeId: number | null;
  awayId: number | null;
  /** Kademe (1 en önemli; config/gameMatchPriority.ts). */
  tier: number;
  /** Maçtaki Avrupa devi sayısı (çekirdek 2, ek liste 1 ağırlık). */
  giants: number;
};

const teamId = (t: Match['home'] | undefined, fallback: number | undefined) => {
  const n = Number((t as { id?: unknown } | undefined)?.id ?? fallback);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const leagueOf = (m: Match) => m.competition_id ?? (m.competition?.id != null ? Number(m.competition.id) : null);

/** Türk takımları: listelerde Türkiye liglerinde oynayan takımlar (o haftanın fikstürü; ek istek yok). */
export function turkishTeamsIn(matches: readonly Match[]): Set<number> {
  const out = new Set<number>(TURKEY_BIG_TEAM_IDS);
  for (const m of matches) {
    const l = leagueOf(m);
    if (l == null || !TURKISH_LEAGUE_IDS.has(l)) continue;
    for (const id of [teamId(m.home, m.home_id), teamId(m.away, m.away_id)]) if (id != null) out.add(id);
  }
  return out;
}

export function tierOf(leagueId: number | null, ids: readonly (number | null)[], turkish: ReadonlySet<number>): number {
  const has = (set: ReadonlySet<number>) => ids.some((id) => id != null && set.has(id));
  if (has(TURKEY_BIG_TEAM_IDS)) return 1;
  if (leagueId != null && UEFA_IDS.has(leagueId) && has(turkish)) return 2;
  if (has(EURO_GIANT_IDS) || has(EURO_GIANT_EXTRA_IDS)) return 3;
  if (leagueId != null && TOP_LEAGUE_IDS.has(leagueId)) return 4;
  return 5;
}

/** Pencere içinde ve henüz başlamamış (durum kodu yok, saat belli) maçlar; fixture başına tek aday. */
export function candidatesIn(matches: readonly Match[], startsAt: Date, endsAt: Date, now: Date): Candidate[] {
  const turkish = turkishTeamsIn(matches);
  const out = new Map<string, Candidate>();
  for (const m of matches) {
    const k = matchKickoffMs(m);
    if (k == null || k <= now.getTime() || k < startsAt.getTime() || k >= endsAt.getTime()) continue;
    if (m.state_code || m.time_tbd) continue;
    const leagueId = leagueOf(m);
    const homeId = teamId(m.home, m.home_id);
    const awayId = teamId(m.away, m.away_id);
    const ids = [homeId, awayId];
    out.set(String(m.id), {
      fixtureId: String(m.id),
      kickoffMs: k,
      leagueId,
      leagueName: m.competition?.name ?? m.competition_name ?? '',
      home: m.home?.name ?? m.home_name ?? '',
      away: m.away?.name ?? m.away_name ?? '',
      homeId,
      awayId,
      tier: tierOf(leagueId, ids, turkish),
      giants: ids.reduce<number>((n, id) => n + (id != null && EURO_GIANT_IDS.has(id) ? 2 : id != null && EURO_GIANT_EXTRA_IDS.has(id) ? 1 : 0), 0),
    });
  }
  return [...out.values()];
}

const leagueRank = (leagueId: number | null) => {
  const i = leagueId != null ? LEAGUE_ORDER.indexOf(leagueId) : -1;
  return i === -1 ? LEAGUE_ORDER.length : i;
};

/** Öncelik sırası: kademe ↑, dev ağırlığı ↓, lig önceliği, başlama saati ↑. */
export function rankCandidates(cands: readonly Candidate[]): Candidate[] {
  return [...cands].sort((a, b) => a.tier - b.tier || b.giants - a.giants || leagueRank(a.leagueId) - leagueRank(b.leagueId) || a.kickoffMs - b.kickoffMs);
}

/**
 * Öncelik sırasıyla en çok `count` maç; 1. kademe (Türkiye'nin büyükleri) her zaman girer, diğerleri çeşitlilik sınırlarına
 * uyar (aynı lig / aynı takım; 1. kademe maçları da sayıma girer). Sınırlar yüzünden liste dolmazsa (aday çeşitliliği yok)
 * kalan en öncelikli adaylarla tamamlanır — yayın için tam liste gerekir.
 */
export function selectMatches(cands: readonly Candidate[], count: number, limits: DiversityLimits): Candidate[] {
  const ranked = rankCandidates(cands);
  const picked: Candidate[] = [];
  const perLeague = new Map<string, number>();
  const perTeam = new Map<number, number>();
  const take = (c: Candidate) => {
    picked.push(c);
    const lk = String(c.leagueId);
    perLeague.set(lk, (perLeague.get(lk) ?? 0) + 1);
    for (const id of [c.homeId, c.awayId]) if (id != null) perTeam.set(id, (perTeam.get(id) ?? 0) + 1);
  };
  for (const c of ranked.filter((x) => x.tier === 1)) if (picked.length < count) take(c);
  for (const c of ranked) {
    if (picked.length >= count) break;
    if (c.tier === 1) continue;
    if ((perLeague.get(String(c.leagueId)) ?? 0) >= limits.maxPerLeague) continue;
    if ([c.homeId, c.awayId].some((id) => id != null && (perTeam.get(id) ?? 0) >= limits.maxPerTeam)) continue;
    take(c);
  }
  for (const c of ranked) {
    if (picked.length >= count) break;
    if (!picked.includes(c)) take(c);
  }
  return rankCandidates(picked);
}

/** Haftalık admin önerisi: otomatik 10 (sınırlarla) önce, sonra kalan adaylar öncelik sırasıyla. */
export function rankWeekly(cands: readonly Candidate[], count = 10): (Candidate & { auto: boolean })[] {
  const auto = selectMatches(cands, count, WEEKLY_LIMITS);
  const ids = new Set(auto.map((c) => c.fixtureId));
  return [...auto.map((c) => ({ ...c, auto: true })), ...rankCandidates(cands.filter((c) => !ids.has(c.fixtureId))).map((c) => ({ ...c, auto: false }))];
}

/** Günün maçları: aynı sıra, günlük sınırlar. */
export function pickDaily(cands: readonly Candidate[], count = 3): Candidate[] {
  return selectMatches(cands, count, DAILY_LIMITS);
}
