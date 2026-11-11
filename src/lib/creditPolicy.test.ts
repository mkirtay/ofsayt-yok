import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Karar 8 koruması: kredi yatırıp kazanma yok.
 * - Tahmin değerlendirme kodu (predictionRecords, AI istatistikleri, değerlendirme cron'u) kredi modüllerini kullanmaz.
 * - Defter türlerinde sonuç / tahmin / bahis çağrıştıran tür yok.
 * - Oyunlara (tahmin oyunu, Frikik) giriş ücretsiz: oyun kodu krediyi asla DÜŞMEZ. Tek istisna (kullanıcı kararı
 *   2026-11-11): oyun ödülleri yalnız server/rewards.ts'ten kredi EKLER (tahmin oyunu haftalık ilk 3 dahil).
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

  it('oyunlara kredi yatırılamaz: oyun kodu kredi düşmez, ödül yalnız server/rewards.ts', () => {
    const dirs = ['src/server/game', 'src/pages/api/game', 'src/pages/api/frikik', 'src/server/frikik', 'src/lib/game'];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(path.join(process.cwd(), d), { withFileTypes: true })) {
        const rel = `${d}/${e.name}`;
        if (e.isDirectory()) walk(rel);
        else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) files.push(rel);
      }
    };
    dirs.forEach(walk);
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = read(f);
      expect(src, f).not.toMatch(/\b(reserveCredits|debitCreditsTx|addCredits|creditCreditsTx|grantReward)\b/);
      expect(src, f).not.toMatch(/credits\s*:\s*\{\s*(increment|decrement)/);
    }
    const rewards = read('src/server/rewards.ts');
    expect(rewards).not.toMatch(/decrement|reserveCredits|debitCreditsTx/);
  });
});
