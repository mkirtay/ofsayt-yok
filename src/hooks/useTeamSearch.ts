import { useEffect, useState } from 'react';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';

export type TeamHit = { id: number; name: string; logo: string | null };

export const TEAM_SEARCH_MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

/** Sportmonks `/teams/search` (proxy) üzerinden debounce'lu takım araması. */
export function useTeamSearch(query: string, limit = 6): { teams: TeamHit[]; loading: boolean; active: boolean } {
  const [teams, setTeams] = useState<TeamHit[]>([]);
  const [settled, setSettled] = useState('');
  const trimmed = query.trim();
  const active = trimmed.length >= TEAM_SEARCH_MIN_CHARS;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const env = await sportmonksClientRequest<
          { id: number; name: string; image_path?: string | null }[]
        >('football', `/teams/search/${encodeURIComponent(trimmed)}`);
        if (cancelled) return;
        setTeams(
          (env.data ?? []).slice(0, limit).map((t) => ({ id: t.id, name: t.name, logo: t.image_path ?? null })),
        );
      } catch {
        if (!cancelled) setTeams([]);
      } finally {
        if (!cancelled) setSettled(trimmed);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [active, trimmed, limit]);

  return { teams: active ? teams : [], loading: active && settled !== trimmed, active };
}
