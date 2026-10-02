/**
 * Ana sayfa yan panelinde seçili lig (`MatchHubPage` `selectedCompId`) — iki id uzayı tek sayıda:
 * - Doğrulanmış legacy eşlemesi olan 11 lig LEGACY id ile (eski davranış: ISR tohumu `competition-sidebar/6`,
 *   header aramasının `?league=6`'sı, UEFA fikstür modu aynen kalır).
 * - Diğer plan ligleri (Arjantin, Brezilya, MLS, alt ligler…) NEGATİF Sportmonks id ile (−636): legacy ve Sportmonks
 *   id'leri çakışıyor (legacy 2 = Premier League, Sportmonks 2 = Şampiyonlar Ligi), negatif uzay ikisiyle de çakışmaz.
 */
import { resolveLegacyCompetitionId, resolveSportmonksLeagueId } from '@/services/sportmonksProviderFlag';

export function hubSelectionIdForLeague(sportmonksLeagueId: number): number {
  return resolveLegacyCompetitionId(sportmonksLeagueId) ?? -sportmonksLeagueId;
}

export function sportmonksLeagueIdOfHubSelection(selectionId: number): number | null {
  return selectionId < 0 ? -selectionId : resolveSportmonksLeagueId(selectionId);
}
