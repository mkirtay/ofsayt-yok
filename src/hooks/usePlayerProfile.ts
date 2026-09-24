import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPlayerMatchRows, getPlayerProfile, type PlayerMatchRow, type PlayerProfile } from '@/services/playerProfile';
import { getTeamLastMatches } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';

/** Oyuncu profili (tek çağrı; proxy'de 30 dk cache'li) — react-query tarafında da 10 dk taze. */
export function usePlayerProfile(playerId: string, enabled = true) {
  return useQuery<PlayerProfile | null>({
    queryKey: ['player-profile', playerId],
    queryFn: () => getPlayerProfile(playerId),
    enabled: enabled && /^\d+$/.test(playerId),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });
}

/** Maç geçmişi varsayılan görünür satır sayısı (her maç ayrı fixture isteği → küçük tutuldu). */
export const PLAYER_MATCHES_INITIAL = 5;
/** "Tümünü Göster" ile en fazla bu kadar maç (takımın son bitmiş maçları). */
export const PLAYER_MATCHES_MAX = 10;

export function splitMatchesForPlayer(finished: Match[], expanded: boolean): { initial: Match[]; rest: Match[]; shown: Match[] } {
  const initial = finished.slice(0, PLAYER_MATCHES_INITIAL);
  const rest = finished.slice(PLAYER_MATCHES_INITIAL, PLAYER_MATCHES_MAX);
  return { initial, rest, shown: expanded ? [...initial, ...rest] : initial };
}

/**
 * Oyuncunun takımının bitmiş son maçları + her biri için oyuncu satırı. İlk 5 hemen, kalanlar "Tümünü Göster"
 * tıklanınca tembel (kendi `useQuery`'si — ilk 5 tekrar çekilmez).
 */
export function usePlayerMatchHistory(playerId: number | null, teamId: number | null) {
  const [expanded, setExpanded] = useState(false);
  const enabled = playerId != null && teamId != null;

  const matchesQuery = useQuery({
    queryKey: ['player-team-matches', teamId],
    queryFn: async () => {
      const list = await getTeamLastMatches(String(teamId), PLAYER_MATCHES_MAX + 5);
      return list.filter((m) => m.status === 'FINISHED');
    },
    enabled,
    staleTime: 5 * 60_000,
  });
  const finished = matchesQuery.data ?? [];
  const { initial, rest } = splitMatchesForPlayer(finished, expanded);

  const initialRows = useQuery<PlayerMatchRow[]>({
    queryKey: ['player-match-rows', playerId, teamId, 'initial', initial.map((m) => m.id).join(',')],
    queryFn: () => getPlayerMatchRows(initial, playerId!, teamId!),
    enabled: enabled && initial.length > 0,
    staleTime: 10 * 60_000,
  });
  const restRows = useQuery<PlayerMatchRow[]>({
    queryKey: ['player-match-rows', playerId, teamId, 'rest', rest.map((m) => m.id).join(',')],
    queryFn: () => getPlayerMatchRows(rest, playerId!, teamId!),
    enabled: enabled && expanded && rest.length > 0,
    staleTime: 10 * 60_000,
  });

  const rows = expanded ? [...(initialRows.data ?? []), ...(restRows.data ?? [])] : (initialRows.data ?? []);
  return {
    rows,
    loading: matchesQuery.isLoading || initialRows.isLoading || (expanded && restRows.isLoading),
    hasMore: rest.length > 0 && !expanded,
    expand: () => setExpanded(true),
    empty: enabled && !matchesQuery.isLoading && finished.length === 0,
  };
}
