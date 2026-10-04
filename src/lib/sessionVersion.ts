/**
 * Oturum sürümü (User.tokenVersion) + rol — her kimlik kontrolünde DB'ye gitmesin diye Redis'te kullanıcı başına
 * 60 sn önbellek. Şifre değişince / sıfırlanınca (tokenVersion artınca) `invalidateSessionVersion` anahtarı hemen
 * siler → iptal anında etkili. Redis yok / hata → DB (asla fırlatmaz; bkz. lib/redis.ts → withRedis).
 */
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withRedis } from '@/lib/redis';
import { cacheKeyPrefix } from '@/lib/cacheNamespace';

export const SESSION_VERSION_TTL_SEC = 60;

export type SessionVersion = { tokenVersion: number; role: Role };

const key = (userId: string) => `${cacheKeyPrefix()}session-version:${userId}`;

function isSessionVersion(v: unknown): v is SessionVersion {
  return !!v && typeof v === 'object' && typeof (v as SessionVersion).tokenVersion === 'number' &&
    typeof (v as SessionVersion).role === 'string';
}

/** Kullanıcının güncel oturum sürümü ve rolü; kullanıcı yoksa null. */
export async function getSessionVersion(userId: string): Promise<SessionVersion | null> {
  const cached = await withRedis((r) => r.get<SessionVersion>(key(userId)), null);
  if (isSessionVersion(cached)) return cached;

  const row = await prisma.user.findUnique({ where: { id: userId }, select: { tokenVersion: true, role: true } });
  if (!row) return null;
  const value: SessionVersion = { tokenVersion: row.tokenVersion, role: row.role };
  await withRedis((r) => r.set(key(userId), value, { ex: SESSION_VERSION_TTL_SEC }), null);
  return value;
}

/** tokenVersion artırıldıktan SONRA çağrılır: bir sonraki kontrol DB'den okur. */
export async function invalidateSessionVersion(userId: string): Promise<void> {
  await withRedis((r) => r.del(key(userId)), 0);
}
