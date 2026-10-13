/**
 * Frikik günlük deneme sayacı (Redis, migration yok): kullanıcı başına günde en fazla FRIKIK_DAILY_ATTEMPTS doğrulanmış
 * koşu tabloya gönderilebilir. INCR atomik → eşzamanlı gönderimler tavanı aşamaz. Anahtar 2 gün yaşar (gün TR saatiyle).
 * Redis yoksa / hata verirse fail-open: `null` (sayılamadı) → gönderim kabul edilir, arayüz "N/5" göstermez. Hız sınırı
 * (kullanıcı 6/dk) ayrıca geçerli kalır.
 */
import { cacheKeyPrefix } from '@/lib/cacheNamespace';
import { FRIKIK_DAILY_ATTEMPTS } from '@/lib/frikik/leaderboard';
import { withRedis } from '@/lib/redis';

export { FRIKIK_DAILY_ATTEMPTS };
const TTL_SECONDS = 2 * 24 * 60 * 60;

const key = (userId: string, day: string) => `${cacheKeyPrefix()}frikik:attempts:v1:${userId}:${day}`;

/** Bir deneme harcar; harcandıktan sonraki sayıyı döner (tavanı aşan değer de döner — çağıran reddeder). */
export async function takeAttempt(userId: string, day: string): Promise<number | null> {
  return withRedis(async (redis) => {
    const k = key(userId, day);
    const [n] = await redis.pipeline().incr(k).expire(k, TTL_SECONDS).exec<[number, number]>();
    return typeof n === 'number' ? n : null;
  }, null);
}

/** Bugün harcanan deneme sayısı (yoksa 0; Redis yoksa null). */
export async function readAttempts(userId: string, day: string): Promise<number | null> {
  return withRedis(async (redis) => Number((await redis.get<number>(key(userId, day))) ?? 0), null);
}
