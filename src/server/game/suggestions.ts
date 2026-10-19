/**
 * Admin hafta oluşturucu için aday maçlar: haftanın UTC günlerinin fikstür listeleri (paylaşımlı cache — ana sayfayla aynı
 * `fixtures/date/{d}` anahtarları; yeni istek türü yok), yalnız başlamamış maçlar; sıra config/gameMatchPriority.ts (Türkiye'nin büyükleri → Avrupa'daki Türk takımları → devler → Süper Lig / büyük 5).
 */
import type { Match } from '@/models/liveScore';
import { getFixturesByDate } from '@/services/liveScoreService';
import { weekRange } from '@/lib/game/week';
import { candidatesIn, rankWeekly } from '@/lib/game/selection';
import { WEEK_MATCH_COUNT } from '@/server/game/weeks';

export type Suggestion = {
  fixtureId: string;
  kickoffAt: string;
  leagueId: number | null;
  leagueName: string;
  home: string;
  away: string;
  /** Öncelik kademesi (1 = Türkiye'nin büyükleri; config/gameMatchPriority.ts). */
  tier: number;
  /** Otomatik önerilen 10'dan mı (çeşitlilik sınırlarıyla; admin "Önerilen 10'u seç" ile işaretler). */
  auto: boolean;
};

/** Sıra: otomatik 10 önce (lib/game/selection.ts → rankWeekly), sonra kalan adaylar öncelik sırasıyla. */
export function rankSuggestions(matches: readonly Match[], startsAt: Date, endsAt: Date, now: Date): Suggestion[] {
  return rankWeekly(candidatesIn(matches, startsAt, endsAt, now), WEEK_MATCH_COUNT).map((c) => ({
    fixtureId: c.fixtureId,
    kickoffAt: new Date(c.kickoffMs).toISOString(),
    leagueId: c.leagueId,
    leagueName: c.leagueName,
    home: c.home,
    away: c.away,
    tier: c.tier,
    auto: c.auto,
  }));
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
