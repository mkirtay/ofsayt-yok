/**
 * Yönetici sayfalarının (/admin/*) SSR kapısı. Geçerli oturum YOK → giriş sayfasına (dönüş adresiyle); oturum var ama
 * ADMIN değil → 404 (sayfanın varlığı gizlenir). API uçları ayrıca `requireAdmin`; middleware ek katman.
 *
 * Neden ayrı: middleware JWT'yi yalnız ÇÖZER (rol çerezdeki değer). Şifre değişimi / Google bağlama / hesap güvenliği
 * gibi nedenlerle iptal edilmiş (tokenVersion artmış) bir oturum çerezi middleware'den eski ADMIN rolüyle geçer, ama
 * `getServerSession` burada null döner. Eskiden bu durumda da `notFound` dönülüyordu → yönetici /admin/kullanicilar'da
 * giriş yerine 404 görüyordu (ilk ziyarette; istemci çerezi temizleyince sonraki ziyaret girişe gidiyordu).
 */
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';

export async function adminPageGuard(
  ctx: Pick<GetServerSidePropsContext, 'req' | 'res' | 'resolvedUrl'>,
): Promise<GetServerSidePropsResult<Record<string, never>>> {
  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  if (!session?.user) {
    const path = (ctx.resolvedUrl || '/admin').split('?')[0];
    return { redirect: { destination: `/auth/signin?callbackUrl=${encodeURIComponent(path)}`, permanent: false } };
  }
  if (session.user.role !== 'ADMIN') return { notFound: true };
  return { props: {} };
}
