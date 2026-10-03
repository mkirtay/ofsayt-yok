/**
 * Tarayıcıdan /api/sportmonks proxy'sine giden TÜM istek kalıpları izin listesinden geçer (7 Ekim 2026 enforce).
 * Kalıplar koddaki gerçek include / filtre sabitleriyle kurulur: bir include değişip izin listesi güncellenmezse
 * bu test kırılır. Kaynak: 2026-10-03 taraması (sayfalar, sekmeler, sezon seçimi, maç / takım / lig / oyuncu
 * sayfaları, Gece maçları, Ligler sekmesi, Gol Krallığı, başlık araması) + istemci servislerinin statik listesi.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProxyAllowlist } from './proxyAllowlist';
import { PLAYER_PROFILE_INCLUDE } from '@/services/playerProfile';
import { PLAYER_LINEUPS_FILTERS, PLAYER_LINEUPS_INCLUDE } from '@/services/playerLineups';
import { TEAM_STATS_INCLUDE } from '@/services/sportmonks/teamSeasonStats';
import { TEAM_UPCOMING_INCLUDE } from '@/services/sportmonks/teamUpcoming';
import { SQUAD_SEASON_STATS_FINISHED_INCLUDE, SQUAD_SEASON_STATS_INCLUDE } from '@/services/sportmonks/teamScorers';
import { TEAM_OVERVIEW_INCLUDE } from '@/services/sportmonks/teamOverview';
import { STANDINGS_WITH_GROUPS_INCLUDE } from '@/services/competitionStandings';
import { TOPSCORER_WITH_APPEARANCES_INCLUDE, topscorerAppearanceFilters } from '@/services/competitionTopScorers';

const liveScoreSrc = readFileSync(path.resolve(__dirname, '../../services/liveScoreService.ts'), 'utf8');
const FIXTURE_INCLUDE = /const SPORTMONKS_FIXTURE_INCLUDE =\s*'([^']+)'/.exec(liveScoreSrc)![1];

const CASES: [string, string, Record<string, string>][] = [
  ['canlı maçlar', 'football/livescores/inplay', { include: FIXTURE_INCLUDE }],
  ['tarihe göre maçlar', 'football/fixtures/date/2026-10-03', { include: FIXTURE_INCLUDE }],
  ['lig fikstürü (UEFA modu)', 'football/fixtures/between/2026-09-01/2026-11-29', { include: FIXTURE_INCLUDE, filters: 'fixtureLeagues:2' }],
  ['takım maç aralığı', 'football/fixtures/between/2026-09-01/2026-10-03/34', { include: FIXTURE_INCLUDE }],
  ['maç + olaylar', 'football/fixtures/19746609', { include: `${FIXTURE_INCLUDE};events` }],
  ['maç istatistiği', 'football/fixtures/19746609', { include: 'statistics' }],
  ['kadro', 'football/fixtures/19746609', { include: 'lineups.player.nationality;lineups.details;participants;metadata', filters: 'metadataTypes:572' }],
  ['karşılaşma geçmişi', 'football/fixtures/head-to-head/34/88', { include: FIXTURE_INCLUDE }],
  ['lig sezonları', 'football/leagues/600', { include: 'seasons' }],
  ['lig adı (favoriler)', 'football/leagues/600', {}],
  ['takım adı (favoriler)', 'football/teams/34', {}],
  ['takım arama (Türkçe, boşluk)', 'football/teams/search/fenerbahçe spor', {}],
  ['takım sayfası özeti', 'football/teams/34', { include: TEAM_OVERVIEW_INCLUDE }],
  ['takım istatistik + sakatlar', 'football/teams/34', { include: TEAM_STATS_INCLUDE, filters: 'teamStatisticSeasons:25749,25580' }],
  ['takım sıradaki maçlar', 'football/teams/34', { include: TEAM_UPCOMING_INCLUDE }],
  ['takım sezon fikstürü', 'football/schedules/seasons/25749/teams/34', {}],
  ['güncel kadro', 'football/squads/teams/34', { include: 'player' }],
  ['sezon kadrosu', 'football/squads/seasons/25749/teams/34', { include: 'player' }],
  ['takım golcüleri (güncel)', 'football/squads/seasons/25749/teams/34', { include: SQUAD_SEASON_STATS_INCLUDE, filters: 'playerStatisticSeasons:25749' }],
  ['takım golcüleri (bitmiş sezon)', 'football/squads/seasons/23614/teams/34', { include: SQUAD_SEASON_STATS_FINISHED_INCLUDE, filters: 'playerStatisticSeasons:23614' }],
  ['puan durumu (eski)', 'football/standings/seasons/25749', { include: 'participant;details.type' }],
  ['puan durumu (gruplu)', 'football/standings/seasons/25749', { include: STANDINGS_WITH_GROUPS_INCLUDE }],
  ['gol krallığı (O gömülü)', 'football/topscorers/seasons/25749', { include: TOPSCORER_WITH_APPEARANCES_INCLUDE, filters: topscorerAppearanceFilters(208, 25749) }],
  ['krallık / disiplin (eski)', 'football/topscorers/seasons/25749', { include: 'player;participant', filters: 'seasonTopscorerTypes:84,85' }],
  ['oyuncu profili', 'football/players/4783', { include: PLAYER_PROFILE_INCLUDE }],
  ['oyuncu profili (sezon)', 'football/players/4783', { include: PLAYER_PROFILE_INCLUDE, filters: 'playerStatisticSeasons:25749' }],
  ['oyuncu maç geçmişi', 'football/players/4783', { include: PLAYER_LINEUPS_INCLUDE, filters: PLAYER_LINEUPS_FILTERS }],
];

describe('istemci Sportmonks istekleri — proxy izin listesi', () => {
  it.each(CASES)('%s', (_name, p, query) => {
    expect(checkProxyAllowlist(p, query).violations).toEqual([]);
  });
});
