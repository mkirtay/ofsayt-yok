/**
 * Gündem'de yazma (post/yorum) öncesi yazar kontrolü. OAuth ile (Google) oluşmuş, şifresi olmayan ve henüz
 * kullanıcı adı seçmemiş hesaplar önce kullanıcı adı seçmelidir. Şifreli (e-posta) hesaplar ve OAuth kaydı olmayan
 * hesaplar (ör. resmi/bot hesapları) bu kurala tabi DEĞİL — mevcut davranış aynen korunur.
 */
import { prisma } from '@/lib/prisma';

export const USERNAME_REQUIRED_CODE = 'USERNAME_REQUIRED';
export const USERNAME_REQUIRED_MESSAGE = "Gündem'de paylaşım yapmadan önce bir kullanıcı adı seçmelisin.";

export type AuthorGateUser = {
  username: string | null;
  password?: string | null;
  _count?: { accounts: number } | null;
};

/** Kullanıcı adı zorunlu mu? (saf — test edilebilir) */
export function mustChooseUsername(user: AuthorGateUser): boolean {
  const hasOAuthAccount = (user._count?.accounts ?? 0) > 0;
  return hasOAuthAccount && !user.password && !user.username?.trim();
}

export const GUNDEM_SUSPENDED_CODE = 'GUNDEM_SUSPENDED';

/** Yönetici askısı yürürlükte mi (giriş ve okuma açık; yalnız Gündem'e yazma kapalı). */
export function isGundemSuspended(until: Date | null | undefined, now = new Date()): boolean {
  return until != null && until.getTime() > now.getTime();
}

/** Askı iletisi: kalıcı askıda tarih yok (bkz. config/moderation.ts → PERMANENT_SUSPENSION). */
export function suspendedMessage(until: Date): string {
  if (until.getUTCFullYear() >= 9999) return "Gündem'de yazma iznin kapatıldı. Okumaya devam edebilirsin.";
  const d = until.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });
  return `Gündem'de yazma iznin ${d} tarihine kadar kapatıldı. Okumaya devam edebilirsin.`;
}

export type GundemAuthorState =
  | { status: 'missing' }
  | { status: 'needsUsername' }
  | { status: 'suspended'; until: Date }
  | { status: 'ok'; createdAt: Date; username: string | null };

/** Yazar durumu + spam kuralları için hesap yaşı (tek sorgu). */
export async function loadGundemAuthor(userId: string, now = new Date()): Promise<GundemAuthorState> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      password: true,
      createdAt: true,
      gundemSuspendedUntil: true,
      _count: { select: { accounts: true } },
    },
  });
  if (!user) return { status: 'missing' };
  if (mustChooseUsername(user)) return { status: 'needsUsername' };
  if (isGundemSuspended(user.gundemSuspendedUntil, now)) return { status: 'suspended', until: user.gundemSuspendedUntil! };
  return { status: 'ok', createdAt: user.createdAt, username: user.username };
}

/** Yazar durumu: kullanıcı yok / kullanıcı adı gerekli / askıda / uygun. */
export async function checkGundemAuthor(userId: string): Promise<'missing' | 'needsUsername' | 'suspended' | 'ok'> {
  return (await loadGundemAuthor(userId)).status;
}
