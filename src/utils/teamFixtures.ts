/**
 * Takım detayı "Fikstür" sekmesi ve başlıktaki "Sıradaki maç" satırı için saf yardımcılar.
 * Gruplama `fixtureDateGroups.ts`'ten gelir (UEFA fikstür görünümüyle aynı desen, TR gününe göre).
 */
import type { Match, Team } from '@/models/liveScore';
import { utcTimeToTr } from './dateFormat';
import { buildFixtureDateGroups, istanbulMatchDate, type FixtureDateGroup } from './fixtureDateGroups';
import { formatFixtureDate, shiftIsoDate } from './fixtureDateLabel';

/** Takımın rakibi ve iç saha mı olduğu; takım maçta yoksa null. */
export function teamOpponent(match: Match, teamId: string): { opponent: Team; isHome: boolean } | null {
  if (String(match.home?.id) === teamId) return { opponent: match.away, isHome: true };
  if (String(match.away?.id) === teamId) return { opponent: match.home, isHome: false };
  return null;
}

/**
 * Bugün (TR) ve sonrasındaki maçlar güne göre gruplu. Geçmiş güne düşen (ör. ertelenmiş ama yeni tarihi
 * verilmemiş) maçlar elenir; yaklaşan maç yoksa geçmişe dönülmez (boş durum gösterilir).
 */
export function buildTeamFixtureGroups(fixtures: Match[], todayIso: string): FixtureDateGroup[] {
  return buildFixtureDateGroups(fixtures, { todayIso, fallbackPastDays: 0 });
}

/** Sıradaki maç = gruplu listenin ilk maçı (sekmedeki ilk satırla her zaman aynı). */
export function nextTeamFixture(groups: FixtureDateGroup[]): Match | null {
  return groups[0]?.matches[0] ?? null;
}

/** Satırdaki başlama saati (TR); saati açıklanmamışsa `tbdLabel`. */
export function fixtureKickoffLabel(match: Match, tbdLabel: string): string {
  if (match.time_tbd || !match.scheduled) return tbdLabel;
  return utcTimeToTr(match.scheduled, match.date);
}

/**
 * "Sıradaki maç" satırının gün + saat kısmı: "Bugün 20:00", "Yarın 20:00", "9 Ekim Cuma 20:00".
 * Saati açıklanmamış maçta yalnızca gün.
 */
export function nextFixtureWhen(
  match: Match,
  todayIso: string,
  locale: string,
  labels: { today: string; tomorrow: string },
): string {
  const date = istanbulMatchDate(match);
  const day =
    date === todayIso ? labels.today : date === shiftIsoDate(todayIso, 1) ? labels.tomorrow : formatFixtureDate(date, locale);
  if (match.time_tbd || !match.scheduled) return day;
  return `${day} ${utcTimeToTr(match.scheduled, match.date)}`;
}
