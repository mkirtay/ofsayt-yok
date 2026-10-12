import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { constantTimeEqual } from '@/lib/constantTimeEqual';

const AUTH_PAGES = ['/profile', '/ai-istatistikleri'];

// ── ESKİ ALAN ADI KAPALI (2026-10-13) ────────────────────────────────────────────────────────────────────────────────
// ofsaytyok.app / www.ofsaytyok.app'teki SAYFA istekleri 410 Gone + kısa "kapatıldı" sayfası alır (yönlendirme yok, link
// yok). Açık kalanlar: /api/*, /_next/*, /.well-known/* ve uzantılı dosyalar (robots.txt, sitemap.xml, favicon, /avatars,
// /images — eski tam adresle kayıtlı avatarlar kırılmasın; robots.txt açık: tarayıcılar eski sayfaları gezip 410'u görsün).
// Diğer host'lar (getscor3.com, ofsayt-yok.vercel.app, preview, localhost) hiç etkilenmez: matcher yalnız bu host'ta çalışır.
// AÇMAK İÇİN: aşağıdaki satırı `false` yap (env gerekmez). Kalıcı kaldırmak: bu blok + config.matcher'daki host girdisi.
const LEGACY_HOST_CLOSED = true;
export const LEGACY_HOSTS: ReadonlySet<string> = new Set(['ofsaytyok.app', 'www.ofsaytyok.app']);

function requestHost(req: NextRequest): string {
  return (req.headers.get('host') ?? '').trim().toLowerCase().replace(/:\d+$/, '');
}

/** Bu istek kapalı eski host'ta, kapatılacak bir SAYFA mı (API, Next varlıkları, .well-known ve uzantılı dosyalar hariç). */
export function isClosedLegacyRequest(req: NextRequest): boolean {
  if (!LEGACY_HOST_CLOSED || !LEGACY_HOSTS.has(requestHost(req))) return false;
  // `nextUrl.pathname` Next veri isteklerini (`/_next/data/<build>/x.json`) sayfa yoluna çevirir → ham URL ve
  // `x-nextjs-data` başlığı da kontrol edilir (bu istekler /_next/* olarak açık kalır).
  if (req.headers.has('x-nextjs-data')) return false;
  const raw = new URL(req.url).pathname;
  const { pathname } = req.nextUrl;
  const open = (p: string) => p.startsWith('/api/') || p.startsWith('/_next/') || p.startsWith('/.well-known/');
  if (open(raw) || open(pathname)) return false;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return !last.includes('.');
}

const LEGACY_GONE_HTML = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Bu adres kapatıldı</title>
<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#0A0E13;color:#E8EDF2;
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-align:center}
p{margin:0;color:#9AA4AF;font-size:18px}</style></head>
<body><main><p>Bu adres kapatıldı.</p></main></body></html>`;

/** 410 Gone: önbelleğe alınmaz (geri açılabilsin), dizine eklenmez. */
export function legacyGoneResponse(): NextResponse {
  return new NextResponse(LEGACY_GONE_HTML, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

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
  return auth !== null && constantTimeEqual(auth, `Bearer ${secret}`);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Eski alan adı kapalı (bkz. LEGACY_HOST_CLOSED) ──
  if (isClosedLegacyRequest(req)) return legacyGoneResponse();

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

  // ── Admin sayfaları (/admin/*): oturum yoksa girişe, ADMIN değilse 404 (varlığı gizlenir) ─────────────
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const token = await getToken({ req });
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = '/auth/signin';
      url.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(url);
    }
    if (token.role !== 'ADMIN') {
      return NextResponse.rewrite(new URL('/404', req.url));
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
  matcher: [
    '/profile',
    '/ai-istatistikleri',
    '/api/admin/:path*',
    '/admin/:path*',
    // Eski alan adı: yalnız bu host'ta, /api /_next /.well-known dışı her yol (uzantı kontrolü kodda). Diğer host'larda
    // middleware bu girdi için hiç çalışmaz.
    {
      source: '/((?!api/|_next/|\\.well-known/).*)',
      has: [{ type: 'host', value: '(?:www\\.)?ofsaytyok\\.app' }],
    },
  ],
};
