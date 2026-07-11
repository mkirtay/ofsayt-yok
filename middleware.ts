import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const AUTH_PAGES = ['/profile', '/ai-istatistikleri'];

/**
 * Cron/GitHub Actions çağrıları (ör. evaluate-predictions) oturum çerezi değil
 * `Authorization: Bearer $CRON_SECRET` header'ı kullanır. Bu kontrol olmadan
 * middleware bu istekleri de session token arayarak 401'e düşürüyordu — istek
 * handler'daki asıl Bearer kontrolüne hiç ulaşamıyordu (bkz. evaluate-predictions.ts).
 */
function isValidCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Admin API koruması ─────────────────────────────────────────────────────
  // requireAdmin() her handler'da DB'den kontrol eder; bu middleware ilk katman.
  if (pathname.startsWith('/api/admin')) {
    if (isValidCronRequest(req)) {
      return NextResponse.next();
    }
    const token = await getToken({ req });
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (token.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.next();
  }

  // ── Sayfa koruması ─────────────────────────────────────────────────────────
  const needsAuth = AUTH_PAGES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  if (needsAuth) {
    const token = await getToken({ req });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/auth/signin';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/profile', '/ai-istatistikleri', '/api/admin/:path*'],
};
