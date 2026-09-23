import { describe, expect, it } from 'vitest';
import {
  buildStatsCacheKey,
  isStatsCacheable,
  STATS_CACHE_TTL_SECONDS,
  statsCacheTtl,
  TEAM_UPCOMING_CACHE_TTL_SECONDS,
} from './statsCache';

describe('statsCache — proxy cache kapsamı', () => {
  const q = { include: 'player.statistics.details', filters: 'playerStatisticSeasons:28203' };

  it('yalnızca istatistik include\'lu kadro-sezon-takım çağrısı cache\'lenir', () => {
    expect(isStatsCacheable('football/squads/seasons/28203/teams/4192', q)).toBe(true);
    expect(isStatsCacheable('/football/squads/seasons/28203/teams/4192/', q)).toBe(true);
    // düz kadro (include=player) ve güncel kadro dokunulmaz
    expect(isStatsCacheable('football/squads/seasons/28203/teams/4192', { include: 'player' })).toBe(false);
    expect(isStatsCacheable('football/squads/teams/4192', q)).toBe(false);
    expect(isStatsCacheable('football/fixtures/1', q)).toBe(false);
  });

  it('anahtar api_token/path içermez, sorgu sırasından bağımsızdır', () => {
    const a = buildStatsCacheKey('football/squads/seasons/1/teams/2', { ...q, api_token: 'SECRET', path: ['x'] });
    const b = buildStatsCacheKey('football/squads/seasons/1/teams/2', { filters: q.filters, include: q.include });
    expect(a).toBe(b);
    expect(a).not.toContain('SECRET');
  });

  it('oyuncu detay çağrısı (players/{id} + statistics include) cache\'lenir; düz oyuncu çağrısı ve alt yollar değil', () => {
    const pq = { include: 'nationality;transfers.type;statistics.details.type' };
    expect(isStatsCacheable('football/players/455805', pq)).toBe(true);
    expect(isStatsCacheable('football/players/455805', { include: 'nationality' })).toBe(false);
    expect(isStatsCacheable('football/players/search/Osimhen', pq)).toBe(false);
    expect(isStatsCacheable('football/players/455805/extra', pq)).toBe(false);
  });

  it('takım fikstürü (teams/{id} + upcoming include) 10 dk, istatistik çağrıları 30 dk cache\'lenir', () => {
    const uq = { include: 'upcoming.participants;upcoming.league;upcoming.state' };
    expect(statsCacheTtl('football/teams/34', uq)).toBe(TEAM_UPCOMING_CACHE_TTL_SECONDS);
    expect(statsCacheTtl('football/players/455805', { include: 'statistics' })).toBe(STATS_CACHE_TTL_SECONDS);
    // düz takım çağrısı ve alt yollar dokunulmaz
    expect(isStatsCacheable('football/teams/34', { include: 'venue' })).toBe(false);
    expect(isStatsCacheable('football/teams/34/extra', uq)).toBe(false);
    expect(isStatsCacheable('football/teams/search/gala', uq)).toBe(false);
  });
});
