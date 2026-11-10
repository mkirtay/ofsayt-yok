/**
 * Milli maç (AF) çözümü: tek `fixtures?id=` isteği (olaylar + kadro + istatistik + oyuncu reytingi gömülü, ~40 KB) →
 * mapper → SWR önbellek (Redis; taze 60 sn, 7 gün saklama). Lig (Sportmonks) kodu bunu çağırmaz.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { loadWithSwr } from '@/server/swrCache';
import { toAfId } from '@/services/apiFootball/ids';
import { mapNationalFixture, type NationalMatchBundle } from '@/services/apiFootball/mapper';
import type { AfFixture } from '@/services/apiFootball/types';
import { apiFootballGet } from './client';

export type NationalLookup = { kind: 'found'; bundle: NationalMatchBundle } | { kind: 'missing' } | { kind: 'error' };

export const NATIONAL_FRESH_SECONDS = 60;

type Stored = { bundle: NationalMatchBundle | null };

export async function lookupNationalMatch(
  appId: string,
  get: typeof apiFootballGet = apiFootballGet,
): Promise<NationalLookup> {
  const afId = toAfId(appId);
  if (afId == null) return { kind: 'missing' };
  try {
    const res = await loadWithSwr<Stored>(
      `${cacheKeyPrefix()}af:fixture:${afId}`,
      { freshSeconds: NATIONAL_FRESH_SECONDS },
      async () => {
        const body = await get<AfFixture>('/fixtures', { id: afId });
        const fixture = body.response?.[0];
        return { bundle: fixture ? mapNationalFixture(fixture) : null };
      },
    );
    if (!res) return { kind: 'error' };
    return res.value.bundle ? { kind: 'found', bundle: res.value.bundle } : { kind: 'missing' };
  } catch (error) {
    console.error('Error fetching national fixture (api-football)', error instanceof Error ? error.message : 'unknown');
    return { kind: 'error' };
  }
}
