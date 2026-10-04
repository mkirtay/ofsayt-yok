/**
 * Sabit zamanlı metin karşılaştırma — Edge runtime (middleware) için; `node:crypto` orada yok. Süre yalnız uzun olan
 * metnin uzunluğuna bağlı, ilk farklı karaktere değil. Node tarafında lib/cronSecret.ts (`timingSafeEqual`).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
