/** Sportmonks maç durumu (`state_id`) → ağaç için kova (bkz. services/sportmonks/stateMapping.ts). İstemci de kullanır. */
export const STATE_NOT_STARTED = new Set([1, 10, 13, 16, 26]);
export const STATE_LIVE = new Set([2, 3, 4, 6, 9, 11, 18, 19, 21, 22, 23, 25]);
export const STATE_AET = 7;
export const STATE_PEN = 8;
export const STATE_AWARDED = new Set([14, 17]);
/** İptal / terk / silinmiş: oynanmayacak, sonuç da yok. */
export const STATE_VOID = new Set([12, 15, 20]);

export const isLegLive = (stateId: number) => STATE_LIVE.has(stateId);
export const isLegFinished = (stateId: number) => !STATE_NOT_STARTED.has(stateId) && !STATE_LIVE.has(stateId) && !STATE_VOID.has(stateId);
export const isLegStarted = (stateId: number) => !STATE_NOT_STARTED.has(stateId) && !STATE_VOID.has(stateId);
