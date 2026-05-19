import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

const AUTH_PAGES = ['/profile', '/ai-istatistikleri'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req });

  // ── Admin API koruması ─────────────────────────────────────────────────────
  // requireAdmin() her handler'da DB'den kontrol eder; bu middleware ilk katman.
  if (pathname.startsWith('/api/admin')) {
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
  if (needsAuth && !token) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth/signin';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/profile', '/ai-istatistikleri', '/api/admin/:path*'],
};
