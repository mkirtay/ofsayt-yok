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

/** Yazar durumu: kullanıcı yok / kullanıcı adı gerekli / uygun. */
export async function checkGundemAuthor(userId: string): Promise<'missing' | 'needsUsername' | 'ok'> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, password: true, _count: { select: { accounts: true } } },
  });
  if (!user) return 'missing';
  return mustChooseUsername(user) ? 'needsUsername' : 'ok';
}
