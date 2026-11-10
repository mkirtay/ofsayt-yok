/**
 * Milli takım sayfası (sade): takım künyesi + son 10 / sıradaki 5 maç + kadro (AF `teams`, `fixtures?team=`, `players/squads`).
 * Önbellek 30 dk. Takım id'si uygulama (kaydırılmış) id'sidir.
 */
import type { Match } from '@/models/liveScore';
import { isTrackedNationalLeague } from '@/config/nationalLeagues';
import { nationalTeamNameTr } from '@/config/nationalTeamNames';
import { toAfId, toAppId } from '@/services/apiFootball/ids';
import { mapNationalMatch } from '@/services/apiFootball/mapper';
import type { AfFixture } from '@/services/apiFootball/types';
import { apiFootballGet } from './client';
import { afCached } from './cache';

const FRIENDLIES_AF_ID = 10;

export type NationalSquadPlayer = { id: number; name: string; number: number | null; position: string; age: number | null; photo?: string };

export type NationalTeamPayload = {
  team: { id: number; name: string; logo?: string; country?: string; founded?: number; code?: string };
  venue?: { name?: string; city?: string; capacity?: number };
  /** Takımın bağlı olduğu turnuva + sezon (sıradaki / son maçlardan; hazırlık hariç): istatistik ve gol krallığı için. */
  focus?: { leagueId: number; season: number };
  last: Match[];
  next: Match[];
  squad: NationalSquadPlayer[];
};

type AfTeam = {
  team: { id: number; name: string; code?: string | null; country?: string | null; founded?: number | null; national?: boolean; logo?: string | null };
  venue?: { name?: string | null; city?: string | null; capacity?: number | null } | null;
};
type AfSquad = { players: Array<{ id: number; name: string; age?: number | null; number?: number | null; position?: string | null; photo?: string | null }> };

export type NationalTeamResult = { kind: 'found'; data: NationalTeamPayload } | { kind: 'missing' } | { kind: 'error' };

export async function loadNationalTeam(appTeamId: string, get: typeof apiFootballGet = apiFootballGet): Promise<NationalTeamResult> {
  const afId = toAfId(appTeamId);
  if (afId == null) return { kind: 'missing' };
  const r = await afCached<NationalTeamPayload | null>(`team:v2:${afId}`, 1800, async () => {
    const [team, last, next, squad] = await Promise.all([
      get<AfTeam>('/teams', { id: afId }),
      get<AfFixture>('/fixtures', { team: afId, last: 10, timezone: 'UTC' }),
      get<AfFixture>('/fixtures', { team: afId, next: 5, timezone: 'UTC' }),
      get<AfSquad>('/players/squads', { team: afId }),
    ]);
    const t = team.response?.[0];
    if (!t) return null;
    const focusFx = [...(next.response ?? []), ...(last.response ?? [])].find((f) => f.league.id !== FRIENDLIES_AF_ID && isTrackedNationalLeague(f.league.id) && f.league.season != null);
    return {
      team: {
        id: toAppId(t.team.id),
        name: nationalTeamNameTr(t.team.name),
        ...(t.team.logo ? { logo: t.team.logo } : {}),
        ...(t.team.country ? { country: nationalTeamNameTr(t.team.country) } : {}),
        ...(t.team.founded ? { founded: t.team.founded } : {}),
        ...(t.team.code ? { code: t.team.code } : {}),
      },
      ...(t.venue?.name ? { venue: { name: t.venue.name, ...(t.venue.city ? { city: t.venue.city } : {}), ...(t.venue.capacity ? { capacity: t.venue.capacity } : {}) } } : {}),
      ...(focusFx ? { focus: { leagueId: toAppId(focusFx.league.id), season: focusFx.league.season! } } : {}),
      last: (last.response ?? [])
        .map(mapNationalMatch)
        .sort((a, b) => `${b.date ?? ''}${b.scheduled ?? ''}`.localeCompare(`${a.date ?? ''}${a.scheduled ?? ''}`)),
      next: (next.response ?? []).map(mapNationalMatch),
      squad: (squad.response?.[0]?.players ?? []).map((p) => ({
        id: toAppId(p.id),
        name: p.name,
        number: p.number ?? null,
        position: p.position ?? '', // AF ham mevki (Goalkeeper/Defender/Midfielder/Attacker); arayüz diline göre istemcide çevrilir
        age: p.age ?? null,
        ...(p.photo ? { photo: p.photo } : {}),
      })),
    };
  });
  if (!r.ok) return { kind: 'error' };
  return r.value ? { kind: 'found', data: r.value } : { kind: 'missing' };
}
