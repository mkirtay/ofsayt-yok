import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Karar 8 koruması: kredi asla bir maç sonucuna ya da tahmine bağlanmaz (kredi yatırıp kazanma yok).
 * - Tahmin değerlendirme kodu (predictionRecords, AI istatistikleri, değerlendirme cron'u) kredi modüllerini kullanmaz.
 * - Defter türlerinde sonuç / tahmin / bahis çağrıştıran tür yok.
 */
const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

describe('kredi politikası (karar 8)', () => {
  it('tahmin değerlendirme kodu kredi bakiyesine dokunmaz', () => {
    const files = [
      'src/lib/predictionRecords.ts',
      'src/lib/loadAiStatsDashboard.ts',
      ...readdirSync(path.join(process.cwd(), 'src/server')).filter((f) => /^analysisPregen\.ts$/.test(f)).map((f) => `src/server/${f}`),
    ];
    for (const f of files) {
      const src = read(f);
      // Bakiyeyi değiştiren hiçbir fonksiyon kullanılmaz (isUniqueViolation gibi yardımcılar serbest).
      expect(src, f).not.toMatch(/\b(addCredits|reserveCredits|refundCredits|settleCredits|unlockWith\w+|unlockAsPrivileged|recordGenerationUnlock|grant\w*Bonus\w*)\b/);
      expect(src, f).not.toMatch(/from '@\/lib\/analysisUnlock'/);
      expect(src, f).not.toMatch(/credits\s*:\s*\{\s*(increment|decrement)/);
    }
  });

  it('defter türlerinde sonuca bağlı tür yok', () => {
    const src = read('src/lib/credits.ts');
    const union = src.slice(src.indexOf('export type CreditTransactionType ='), src.indexOf('export type SpendStatus'));
    const types = [...union.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(5);
    for (const t of types) expect(t).not.toMatch(/WIN|HIT|PREDICTION|RESULT|BET|PAYOUT|STAKE/);
  });
});
