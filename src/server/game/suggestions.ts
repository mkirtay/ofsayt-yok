/**
 * Admin hafta oluşturucu için aday maçlar: haftanın UTC günlerinin fikstür listeleri (paylaşımlı cache — ana sayfayla aynı
 * `fixtures/date/{d}` anahtarları; yeni istek türü yok), yalnız başlamamış maçlar, lig önceliğine göre sıralı.
 */
import type { Match } from '@/models/liveScore';
import { getFixturesByDate } from '@/services/liveScoreService';
import { weekRange } from '@/lib/game/week';
import { matchKickoffMs } from '@/utils/matchActivity';

/** Öncelik: Süper Lig, UEFA kupaları, beş büyük lig, TFF 1. Lig / Türkiye Kupası. Listede olmayan ligler sona. */
export const LEAGUE_PRIORITY: readonly number[] = [600, 2, 5, 2286, 8, 564, 384, 82, 301, 606, 603];

export type Suggestion = {
  fixtureId: string;
  kickoffAt: string;
  leagueId: number | null;
  leagueName: string;
  home: string;
  away: string;
};

export function rankSuggestions(matches: readonly Match[], startsAt: Date, endsAt: Date, now: Date): Suggestion[] {
  const out = new Map<string, Suggestion & { prio: number; k: number }>();
  for (const m of matches) {
    const k = matchKickoffMs(m);
    if (k == null || k <= now.getTime() || k < startsAt.getTime() || k >= endsAt.getTime()) continue;
    if (m.state_code || m.time_tbd) continue;
    const leagueId = m.competition_id ?? (m.competition?.id != null ? Number(m.competition.id) : null);
    const idx = leagueId != null ? LEAGUE_PRIORITY.indexOf(leagueId) : -1;
    out.set(String(m.id), {
      fixtureId: String(m.id),
      kickoffAt: new Date(k).toISOString(),
      leagueId,
      leagueName: m.competition?.name ?? m.competition_name ?? '',
      home: m.home?.name ?? m.home_name ?? '',
      away: m.away?.name ?? m.away_name ?? '',
      prio: idx === -1 ? LEAGUE_PRIORITY.length : idx,
      k,
    });
  }
  return [...out.values()].sort((a, b) => a.prio - b.prio || a.k - b.k).map(({ prio: _p, k: _k, ...s }) => s);
}

export async function loadSuggestions(weekKey: string, now: Date = new Date(), listFor = getFixturesByDate): Promise<Suggestion[] | null> {
  const r = weekRange(weekKey);
  if (!r) return null;
  const days: string[] = [];
  for (let t = r.startsAt.getTime(); t < r.endsAt.getTime(); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  days.push(new Date(r.endsAt.getTime() - 1).toISOString().slice(0, 10));
  const lists = await Promise.all([...new Set(days)].map((d) => listFor(d).catch(() => [] as Match[])));
  return rankSuggestions(lists.flat(), r.startsAt, r.endsAt, now).slice(0, 80);
}
