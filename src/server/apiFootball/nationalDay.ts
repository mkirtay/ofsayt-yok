/**
 * Günün milli maçları (ana sayfa listesi): TEK `fixtures?date=&timezone=Europe/Istanbul` isteği (Türkiye günü), turnuva
 * beyaz listesine (config/nationalLeagues.ts) süzülür; ham yanıt ~1 MB (günde ~1000 maç) olduğu için yalnız süzülmüş +
 * eşlenmiş liste önbelleğe girer. Canlı skor da bu listeden gelir (status/goals canlı güncellenir) → ayrı canlı isteği yok.
 * Tazelik: bugün 60 sn, dün/yarın 5 dk, uzak günler 15 dk – 1 sa → günlük istek: kullanıcı sayısından bağımsız ≈ ≤ 1/dk.
 */
import type { Match } from '@/models/liveScore';
import { isSeniorMenTeamName, isTrackedNationalLeague } from '@/config/nationalLeagues';
import { mapNationalMatch } from '@/services/apiFootball/mapper';
import type { AfFixture } from '@/services/apiFootball/types';
import { todayIsoIstanbul, shiftIsoDate } from '@/utils/dateStrip';
import { apiFootballGet } from './client';
import { afCached } from './cache';

export function nationalDayFreshSeconds(date: string, todayIso: string): number {
  if (date === todayIso) return 60;
  if (date === shiftIsoDate(todayIso, -1) || date === shiftIsoDate(todayIso, 1)) return 300;
  return date < todayIso ? 3600 : 900;
}

export type NationalDayResult = { ok: true; matches: Match[] } | { ok: false };

export async function loadNationalDay(
  date: string,
  get: typeof apiFootballGet = apiFootballGet,
  todayIso: string = todayIsoIstanbul(),
): Promise<NationalDayResult> {
  const r = await afCached<Match[]>(`day:${date}`, nationalDayFreshSeconds(date, todayIso), async () => {
    const body = await get<AfFixture>('/fixtures', { date, timezone: 'Europe/Istanbul' });
    return (body.response ?? []).filter((f) => isTrackedNationalLeague(f.league.id) && isSeniorMenTeamName(f.teams.home.name) && isSeniorMenTeamName(f.teams.away.name)).map(mapNationalMatch);
  });
  return r.ok ? { ok: true, matches: r.value } : { ok: false };
}
