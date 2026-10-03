/**
 * İki ayaklı eşleşmenin 1. ayağı — Sportmonks aggregate yokken (2. ayak oynanmamış ya da canlı) toplamı hesaplamak
 * için. Tarayıcıda `/api/sportmonks` proxy'si: `fixtures/head-to-head/{ev}/{dep}` maç kartı karşılaşma geçmişiyle
 * AYNI istek (aynı include → aynı sunucu cache anahtarı), ek Sportmonks isteği çoğunlukla yok.
 */
import type { Match } from '@/models/liveScore';
import type { SportmonksFixture } from './sportmonks/types';
import { sportmonksClientRequest } from './sportmonksRuntimeClient';
import { mapSportmonksFixtureToMatch } from './sportmonksFixtureMapper';
import { SPORTMONKS_FIXTURE_INCLUDE } from './liveScoreService';
import { pickFirstLeg } from '@/utils/aggregateScore';

export async function getFirstLeg(secondLeg: Match): Promise<Match | null> {
  const homeId = secondLeg.home?.id;
  const awayId = secondLeg.away?.id;
  if (!homeId || !awayId) return null;
  const envelope = await sportmonksClientRequest<SportmonksFixture[]>('football', `/fixtures/head-to-head/${homeId}/${awayId}`, {
    include: SPORTMONKS_FIXTURE_INCLUDE,
  });
  return pickFirstLeg(secondLeg, (envelope.data ?? []).map(mapSportmonksFixtureToMatch));
}
