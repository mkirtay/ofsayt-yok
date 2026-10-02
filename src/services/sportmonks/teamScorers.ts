/**
 * Takımın gol / asist krallığı — Kadro sekmesiyle AYNI istek (`squads/seasons/{s}/teams/{id}?include=
 * player.statistics.details&filters=playerStatisticSeasons:{s}`, bkz. liveScoreService.getTeamSquadStats) →
 * proxy/CDN/Redis önbelleği paylaşılır. Turnuva-sezon başına bir istek; "Tümü" oyuncu bazında toplanır.
 * Kendi kalesine atılan gol oyuncu istatistiğine girmez (GS 2026/27 ŞL tek golü kendi kalesine: liste boş).
 */
import { extractSquadStats } from '../sportmonksKatman2Mapper';
import type { SportmonksSquadStatsRow } from './types';
import { normalizeDisplayName } from '@/utils/displayName';

export const SQUAD_SEASON_STATS_INCLUDE = 'player.statistics.details';
/**
 * Bitmiş sezon için aynı istek + `player.statistics.season`: sezonun `finished` bayrağı gelir, cachePolicy yanıtı
 * 30 gün tutar. (Sürmekte olan sezon Kadro sekmesiyle birebir aynı isteği kullanır — önbellek paylaşılır.)
 */
export const SQUAD_SEASON_STATS_FINISHED_INCLUDE = 'player.statistics.details;player.statistics.season';
export const squadSeasonStatsFilters = (seasonId: number) => `playerStatisticSeasons:${seasonId}`;

export type TeamScorer = { playerId: number; name: string; photo?: string; goals: number; assists: number; apps: number };

export function extractTeamScorers(rows: SportmonksSquadStatsRow[], seasonId: number, teamId: number): TeamScorer[] {
  const stats = extractSquadStats(rows, seasonId, teamId);
  const out: TeamScorer[] = [];
  for (const row of rows) {
    const line = stats[row.player_id];
    if (!line?.appearances) continue;
    const goals = line.goals ?? 0;
    const assists = line.assists ?? 0;
    if (goals <= 0 && assists <= 0) continue;
    out.push({
      playerId: row.player_id,
      name: normalizeDisplayName((row.player?.display_name ?? row.player?.name ?? '').trim()),
      ...(row.player?.image_path ? { photo: row.player.image_path } : {}),
      goals,
      assists,
      apps: line.appearances,
    });
  }
  return out;
}

/** Birden çok turnuvanın listesi → oyuncu başına toplam. */
export function mergeTeamScorers(lists: TeamScorer[][]): TeamScorer[] {
  const byId = new Map<number, TeamScorer>();
  for (const list of lists) {
    for (const p of list) {
      const prev = byId.get(p.playerId);
      byId.set(p.playerId, prev ? { ...prev, goals: prev.goals + p.goals, assists: prev.assists + p.assists, apps: prev.apps + p.apps } : { ...p });
    }
  }
  return [...byId.values()];
}

/** Gol (ya da asist) sırası; eşitlikte diğer değer, sonra daha az maç, sonra ad. Değeri 0 olan elenir. */
export function rankTeamScorers(list: TeamScorer[], mode: 'goals' | 'assists', limit = 5): TeamScorer[] {
  const other = mode === 'goals' ? 'assists' : 'goals';
  return list
    .filter((p) => p[mode] > 0)
    .sort((a, b) => b[mode] - a[mode] || b[other] - a[other] || a.apps - b.apps || a.name.localeCompare(b.name, 'tr'))
    .slice(0, limit);
}
