/**
 * Admin hafta oluşturucu için aday maçlar: haftanın UTC günlerinin fikstür listeleri (paylaşımlı cache — ana sayfayla aynı
 * `fixtures/date/{d}` anahtarları; yeni istek türü yok), yalnız başlamamış maçlar; sıra lib/game/selection.ts (büyük takım ↓, lig önceliği, saat).
 */
import type { Match } from '@/models/liveScore';
import { getFixturesByDate } from '@/services/liveScoreService';
import { weekRange } from '@/lib/game/week';
import { candidatesIn, rankWeekly } from '@/lib/game/selection';

export type Suggestion = {
  fixtureId: string;
  kickoffAt: string;
  leagueId: number | null;
  leagueName: string;
  home: string;
  away: string;
  /** Maçtaki büyük takım sayısı (0–2; lib/game/selection.ts BIG_TEAM_IDS). */
  big: number;
};

/** Sıra: büyük takım sayısı ↓ (derbiler ve Avrupa devleri önde), lig önceliği, başlama saati. */
export function rankSuggestions(matches: readonly Match[], startsAt: Date, endsAt: Date, now: Date): Suggestion[] {
  return rankWeekly(candidatesIn(matches, startsAt, endsAt, now)).map(({ kickoffMs, ...c }) => ({ ...c, kickoffAt: new Date(kickoffMs).toISOString() }));
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
