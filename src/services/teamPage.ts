/**
 * Takım sayfası (/teams/[id] + ana sayfa takım paneli) istemci istekleri. Tarayıcıda `/api/sportmonks` proxy'sine,
 * sunucuda paylaşımlı cache'e gider (bkz. sportmonksRuntimeClient.ts).
 */
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import {
  mapTeamOverview,
  TEAM_OVERVIEW_INCLUDE,
  type SportmonksTeamOverview,
  type TeamOverview,
} from './sportmonks/teamOverview';

/** Son Maçlar + Fikstür + başlık (form, sıradaki maç) — tek `teams/{id}` isteği. Hata fırlatır (react-query yeniden dener). */
export async function getTeamOverview(teamId: string): Promise<TeamOverview> {
  const envelope = await sportmonksClientRequest<SportmonksTeamOverview>('football', `/teams/${teamId}`, {
    include: TEAM_OVERVIEW_INCLUDE,
  });
  return mapTeamOverview(envelope.data);
}
