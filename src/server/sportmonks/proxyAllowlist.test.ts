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
import { TOPSCORER_WITH_APPEARANCES_INCLUDE, topscorerAppearanceFilters } from '@/services/competitionTopScorers';
import { TEAM_STATS_INCLUDE, teamStatsFilters } from '@/services/sportmonks/teamSeasonStats';

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
  ['football/standings/seasons/28203', { include: 'participant;details.type;group;stage;form', per_page: '50', page: '1' }],
  ['football/topscorers/seasons/28203', { include: 'player;participant', filters: 'seasonTopscorerTypes:208', per_page: '50', page: '4' }],
  [
    'football/topscorers/seasons/28203',
    { include: TOPSCORER_WITH_APPEARANCES_INCLUDE, filters: topscorerAppearanceFilters(209, 28203), per_page: '50', page: '2' },
  ],
  ['football/squads/teams/34', { include: 'player' }],
  ['football/squads/seasons/28203/teams/34', { include: 'player.statistics.details', filters: 'playerStatisticSeasons:28203' }],
  ['football/teams/34', { include: TEAM_UPCOMING_INCLUDE }],
  ['football/teams/34', { include: TEAM_OVERVIEW_INCLUDE }],
  ['football/teams/34', { include: TEAM_STATS_INCLUDE, filters: teamStatsFilters([28203, 28155]) }],
  ['football/schedules/seasons/25682/teams/34', {}],
  [
    'football/squads/seasons/25682/teams/34',
    { include: 'player.statistics.details;player.statistics.season', filters: 'playerStatisticSeasons:25682' },
  ],
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

  it('bilinmeyen path / include / filtre / aşırı sayfa yakalanır; bilinmeyen param atılır', () => {
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
        'filter:bookmakers',
      ]),
    );
    expect(r.query).not.toHaveProperty('foo');
    expect(r.unsafe).toBe(false);
  });

  it('api_token ve bilinmeyen parametreler upstream sorgusuna girmez', () => {
    const r = checkProxyAllowlist('football/teams/34', { api_token: '', locale: 'tr', include: 'seasons' });
    expect(r.allowed).toBe(true);
    expect(r.query).toEqual({ include: 'seasons' });
  });

  describe('güvenlik denetimi (2026-10-04)', () => {
    it.each([
      ['sorgu enjeksiyonu (?)', ['football', 'teams', 'search', 'x?include=odds&per_page=500']],
      ['parça (#)', ['football', 'teams', 'search', 'x#y']],
      ['yüzde', ['football', 'teams', 'search', 'x%2F..']],
      ['üst dizin', ['football', '..', 'odds']],
      ['nokta', ['football', '.', 'teams', '34']],
      ['segment içinde eğik çizgi', ['football', 'teams/34']],
      ['ters eğik çizgi', ['football', 'teams', 'search', 'a\\b']],
      ['kontrol karakteri', ['football', 'teams', 'search', 'a\tb']],
      ['boş segment', ['football', '', 'teams', '34']],
    ])('güvensiz yol moddan bağımsız reddedilir: %s', (_n, segments) => {
      const r = checkProxyAllowlist(segments, {});
      expect(r.allowed).toBe(false);
      expect(r.unsafe).toBe(true);
    });

    it('metin yolda da arama sorgu enjeksiyonu yakalanır (enforce atlatma)', () => {
      const r = checkProxyAllowlist('football/teams/search/x?include=odds&per_page=500', { page: '1' });
      expect(r.allowed).toBe(false);
      expect(r.unsafe).toBe(true);
    });

    it("arama terimi: harf, rakam, boşluk, . ' - kabul", () => {
      for (const q of ['fenerbahçe spor', "Borussia M'gladbach", 'St. Pauli', 'Paris Saint-Germain', 'İstanbul 1907']) {
        expect(checkProxyAllowlist(['football', 'teams', 'search', q], {}).violations).toEqual([]);
      }
      for (const q of ['a;b', 'a&b', 'a=b', 'a<b>', 'x'.repeat(61)]) {
        expect(checkProxyAllowlist(['football', 'teams', 'search', q], {}).allowed).toBe(false);
      }
    });

    it('dizi (tekrarlanan) parametre reddedilir — önbellek zehirlemesi yok', () => {
      const r = checkProxyAllowlist('football/teams/34', { include: ['seasons', 'odds'] });
      expect(r.unsafe).toBe(true);
    });

    it('include alan seçimi ve filtre değerleri doğrulanır', () => {
      expect(checkProxyAllowlist('football/fixtures/1', { include: 'coaches:common_name,display_name' }).allowed).toBe(true);
      expect(checkProxyAllowlist('football/fixtures/1', { include: 'coaches:name&x' }).violations).toEqual([
        'include-alan:coaches',
      ]);
      expect(checkProxyAllowlist('football/fixtures/1', { include: 'coaches:a:b' }).allowed).toBe(false);
      expect(checkProxyAllowlist('football/fixtures/1', { filters: 'metadataTypes:572,613' }).allowed).toBe(true);
      expect(checkProxyAllowlist('football/fixtures/1', { filters: 'metadataTypes:abc' }).violations).toEqual([
        'filter-deger:metadataTypes',
      ]);
      expect(checkProxyAllowlist('football/fixtures/1', { filters: 'metadataTypes' }).allowed).toBe(false);
    });

    it('per_page / page tam sayı ve sınır içinde', () => {
      expect(checkProxyAllowlist('football/livescores/inplay', { per_page: '50', page: '10' }).allowed).toBe(true);
      for (const q of [{ per_page: '0' }, { per_page: '1e1' }, { page: '-1' }, { page: '' }, { per_page: '51' }]) {
        expect(checkProxyAllowlist('football/livescores/inplay', q).allowed).toBe(false);
      }
    });
  });

  it('genel path imzası id/tarih/aramayı gizler', () => {
    expect(genericSportmonksPath('/football/fixtures/between/2026-01-01/2026-02-01/34/')).toBe('football/fixtures/between/{date}/{date}/{id}');
    expect(genericSportmonksPath('football/teams/search/Beşiktaş')).toBe('football/teams/search/{q}');
    expect(genericSportmonksPath('football/fixtures/multi/1,2,3')).toBe('football/fixtures/multi/{ids}');
  });

  it('mod: varsayılan enforce; log/off açıkça seçilir', () => {
    expect(allowlistMode(undefined)).toBe('enforce');
    expect(allowlistMode('log')).toBe('log');
    expect(allowlistMode('off')).toBe('off');
    expect(allowlistMode('yanlis')).toBe('enforce');
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
