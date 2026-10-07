/**
 * Paylaşım bağlantıları — sim.ts'e BAĞIMLI DEĞİL: ana sayfa kartı ve başlık gibi ilk yük parçalarından içe aktarılır;
 * doğrulama (`parseShare`, sim'e bağlı) share.ts'te kalır. Günlü bağlantı (`d=`) günün oyununa açılır.
 */
export type ShareInfo = { score: number; level: number; day: string | null };

export function sharePath(level: number, score: number, day: string | null = null): string {
  return `/frikik?l=${level}&s=${score}${day ? `&d=${day}` : ''}`;
}

export function shareImagePath(info: ShareInfo | null): string {
  return info ? `/api/og/frikik?l=${info.level}&s=${info.score}${info.day ? `&d=${info.day}` : ''}` : '/api/og/frikik';
}
