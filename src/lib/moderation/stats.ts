/**
 * Reddedilen / işaretlenen içerik sayaçları (ModerationStat): gün + yüzey + kategori + sonuç → sayı. Kişisel veri yok
 * (kullanıcı, metin, IP tutulmaz). Sayaç hatası asıl isteği bozmaz.
 */
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';

export type StatSurface = 'post' | 'comment' | 'profile';
export type StatOutcome = 'rejected' | 'flagged';

function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordModerationStat(
  surface: StatSurface,
  categories: readonly string[],
  outcome: StatOutcome,
  now = new Date(),
): Promise<void> {
  const day = utcDay(now);
  for (const category of categories.length ? categories : ['other']) {
    const where = { day_surface_category_outcome: { day, surface, category, outcome } };
    try {
      await prisma.moderationStat.upsert({ where, create: { day, surface, category, outcome, count: 1 }, update: { count: { increment: 1 } } });
    } catch {
      // Aynı anda iki ilk yazım (benzersiz çakışma) → artık satır var, artır.
      try {
        await prisma.moderationStat.update({ where, data: { count: { increment: 1 } } });
      } catch (e) {
        captureError('moderation:stat', e);
      }
    }
  }
}
