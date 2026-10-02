import { describe, it, expect, vi, beforeEach } from 'vitest';

const sentry = vi.hoisted(() => ({ captureMessage: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: sentry.captureMessage,
  withScope: (fn: (s: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setExtras: vi.fn(), setFingerprint: vi.fn() }),
}));

import {
  allowlistMode,
  checkProxyAllowlist,
  genericSportmonksPath,
  logAllowlistViolation,
  resetAllowlistLogThrottle,
} from './proxyAllowlist';
import { PLAYER_PROFILE_INCLUDE } from '@/services/playerProfile';
import { PLAYER_LINEUPS_FILTERS, PLAYER_LINEUPS_INCLUDE } from '@/services/playerLineups';
import { TEAM_UPCOMING_INCLUDE } from '@/services/sportmonks/teamUpcoming';
import { TEAM_OVERVIEW_INCLUDE } from '@/services/sportmonks/teamOverview';

const FIXTURE_INCLUDE = 'participants;scores;state;periods;league.country;venue;referees.referee;round;stage;group';

/** Web'in bugün proxy'ye attığı istekler (liveScoreService, playerProfile, teamUpcoming, FavoritesTab, useTeamSearch). */
const WEB_REQUESTS: [string, Record<string, string>][] = [
  ['football/livescores/inplay', { include: FIXTURE_INCLUDE, per_page: '50', page: '1', api_token: '' }],
  ['football/fixtures/date/2026-09-30', { include: FIXTURE_INCLUDE, per_page: '50', page: '2' }],
  ['football/fixtures/between/2026-09-16/2026-12-14', { include: FIXTURE_INCLUDE, filters: 'fixtureLeagues:2', per_page: '50', page: '1' }],
  ['football/fixtures/between/2026-07-03/2026-09-30/34', { include: FIXTURE_INCLUDE, per_page: '50', page: '1' }],
  ['football/fixtures/19746594', { include: `${FIXTURE_INCLUDE};events` }],
  ['football/fixtures/19746594', { include: 'statistics' }],
  [
    'football/fixtures/19745050',
    { include: 'lineups.player.nationality;lineups.details;participants;metadata', filters: 'metadataTypes:572' },
  ],
  ['football/fixtures/19746594', { include: 'lineups.player.nationality;lineups.details;participants' }],
  ['football/fixtures/head-to-head/34/88', { include: FIXTURE_INCLUDE }],
  ['football/leagues/600', { include: 'seasons' }],
  ['football/leagues/600', {}],
  ['football/standings/seasons/28203', { include: 'participant;details.type', per_page: '50', page: '1' }],
  ['football/topscorers/seasons/28203', { include: 'player;participant', filters: 'seasonTopscorerTypes:208', per_page: '50', page: '4' }],
  ['football/squads/teams/34', { include: 'player' }],
  ['football/squads/seasons/28203/teams/34', { include: 'player.statistics.details', filters: 'playerStatisticSeasons:28203' }],
  ['football/teams/34', { include: TEAM_UPCOMING_INCLUDE }],
  ['football/teams/34', { include: TEAM_OVERVIEW_INCLUDE }],
  ['football/teams/34', {}],
  ['football/teams/search/Galatasaray', {}],
  ['football/players/455805', { include: PLAYER_PROFILE_INCLUDE }],
  ['football/players/455805', { include: PLAYER_LINEUPS_INCLUDE, filters: PLAYER_LINEUPS_FILTERS }],
];

describe('proxy izin listesi', () => {
  beforeEach(() => {
    sentry.captureMessage.mockReset();
    resetAllowlistLogThrottle();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each(WEB_REQUESTS)('web isteği izinli: %s', (path, query) => {
    const r = checkProxyAllowlist(path, query);
    expect(r.violations).toEqual([]);
    expect(r.allowed).toBe(true);
  });

  it('bilinmeyen path / include / param / aşırı sayfa yakalanır', () => {
    const r = checkProxyAllowlist('football/odds/pre-match/fixtures/19746594', {
      include: 'participants;odds.bookmaker',
      per_page: '1000',
      page: '99',
      foo: 'bar',
      filters: 'bookmakers:2',
    });
    expect(r.allowed).toBe(false);
    expect(r.violations).toEqual(
      expect.arrayContaining([
        'path:football/odds/pre-match/fixtures/{id}',
        'include:odds.bookmaker',
        'per_page:1000',
        'page:99',
        'param:foo',
        'filter:bookmakers',
      ]),
    );
  });

  it('genel path imzası id/tarih/aramayı gizler', () => {
    expect(genericSportmonksPath('/football/fixtures/between/2026-01-01/2026-02-01/34/')).toBe('football/fixtures/between/{date}/{date}/{id}');
    expect(genericSportmonksPath('football/teams/search/Beşiktaş')).toBe('football/teams/search/{q}');
    expect(genericSportmonksPath('football/fixtures/multi/1,2,3')).toBe('football/fixtures/multi/{ids}');
  });

  it('mod: varsayılan log; enforce/off açıkça seçilir', () => {
    expect(allowlistMode(undefined)).toBe('log');
    expect(allowlistMode('enforce')).toBe('enforce');
    expect(allowlistMode('off')).toBe('off');
    expect(allowlistMode('yanlis')).toBe('log');
  });

  it('aynı imza için Sentry olayı 10 dk\'da bir (log satırı her seferinde)', () => {
    const r = checkProxyAllowlist('football/odds/x', {});
    const now = Date.parse('2026-09-30T12:00:00Z');
    logAllowlistViolation(r, { mode: 'log', userAgent: 'OfsaytYok/1.0 (iOS)' }, now);
    logAllowlistViolation(r, { mode: 'log' }, now + 60_000);
    logAllowlistViolation(r, { mode: 'log' }, now + 11 * 60_000);
    expect(sentry.captureMessage).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledTimes(3);
  });
});
