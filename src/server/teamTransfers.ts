/**
 * Takım sayfası "Transferler" sekmesi (`/api/teams/[id]/transfers`) — `transfers/teams/{id}` en çok 2 sayfa (Transfer
 * havuzu; maç / Fixture kotasına dokunmaz). Ham sayfalar paylaşımlı Sportmonks önbelleğinden (cachePolicy: 12 sa, eski kopya
 * 2 gün); süzülmüş sonuç ayrıca Redis SWR'de 12 sa taze / 3 gün (tüm instance'lar ve ziyaretçiler tek hesap paylaşır).
 * Sekme açılınca istenir; SSR'a / ilk görünüme girmez.
 *
 * Hata ≠ veri yok: 1. sayfa alınamazsa FIRLATIR (uç 503 → istemci "yüklenemedi · tekrar dene"); 2. sayfa hatası yalnız
 * eksik liste demek → 1. sayfayla devam. Boş liste yalnız Sportmonks gerçekten satır döndürmediyse.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import {
  mapTeamTransfers,
  TEAM_TRANSFERS_INCLUDE,
  TEAM_TRANSFERS_MAX_PAGES,
  TEAM_TRANSFERS_PER_PAGE,
  type SportmonksTeamTransferRow,
  type TeamTransfers,
} from '@/services/sportmonks/teamTransfers';
import { loadWithSwr } from '@/server/swrCache';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { todayIsoIstanbul } from '@/utils/dateStrip';

const HOUR = 3600;
export const TEAM_TRANSFERS_FRESH_SECONDS = 12 * HOUR;
const KEEP_SECONDS = 3 * 24 * HOUR;

function key(teamId: number): string {
  return `${cacheKeyPrefix()}team-transfers:v1:${teamId}`;
}

async function fetchPage(teamId: number, page: number) {
  return sportmonksClientRequest<SportmonksTeamTransferRow[]>('football', `/transfers/teams/${teamId}`, {
    include: TEAM_TRANSFERS_INCLUDE,
    per_page: String(TEAM_TRANSFERS_PER_PAGE),
    ...(page > 1 ? { page: String(page) } : {}),
  });
}

/** Ham satırlar (en çok 2 sayfa). Takım yok (404) → boş; 1. sayfa geçici hatası fırlar. */
export async function fetchTeamTransferRows(teamId: number): Promise<SportmonksTeamTransferRow[]> {
  let first;
  try {
    first = await fetchPage(teamId, 1);
  } catch (e) {
    if (e instanceof SportmonksHttpError && e.status === 404) return [];
    throw e;
  }
  const rows = Array.isArray(first.data) ? [...first.data] : [];
  for (let page = 2; page <= TEAM_TRANSFERS_MAX_PAGES && first.pagination?.has_more; page++) {
    try {
      const next = await fetchPage(teamId, page);
      if (Array.isArray(next.data)) rows.push(...next.data);
      if (!next.pagination?.has_more) break;
    } catch (e) {
      console.warn('[team-transfers] sonraki sayfa alınamadı', teamId, page, e instanceof Error ? e.message : e);
      break;
    }
  }
  return rows;
}

export type TeamTransfersPayload = TeamTransfers & { asOf: string };

export async function computeTeamTransfers(teamId: number, todayIso: string = todayIsoIstanbul()): Promise<TeamTransfersPayload> {
  const rows = await fetchTeamTransferRows(teamId);
  return { ...mapTeamTransfers(rows, teamId, todayIso), asOf: todayIso };
}

/** Süzülmüş Gelenler / Gidenler. Hiç üretilemezse (Sportmonks / önbellek hatası, eski kopya da yok) fırlatır. */
export async function loadTeamTransfers(teamId: number): Promise<TeamTransfersPayload> {
  let failure: unknown = null;
  const result = await loadWithSwr(key(teamId), { freshSeconds: TEAM_TRANSFERS_FRESH_SECONDS, keepSeconds: KEEP_SECONDS }, async () => {
    try {
      return await computeTeamTransfers(teamId);
    } catch (e) {
      failure = e;
      return null;
    }
  });
  if (!result) throw failure ?? new Error('team-transfers: üretilemedi');
  return result.value;
}
