/**
 * /admin ana sayfası ve yönetici sayfa kapısı: her yönetici sayfası listede; oturumsuz → giriş, ADMIN değil → 404;
 * kullanıcıya görünen sitede (footer, header, alt menü), robots.txt ve sitemap'te /admin yok; sayaç rozeti.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const session = vi.hoisted(() => ({ value: null as null | { user: { role: string } } }));
vi.mock('next-auth/next', () => ({ getServerSession: async () => session.value }));
vi.mock('@/lib/auth-options', () => ({ authOptions: {} }));

import { ADMIN_PAGES } from '@/config/adminPages';
import { adminPageGuard } from '@/lib/adminPageGuard';
import AdminHome from '@/components/AdminHome';

const SRC = path.resolve(__dirname, '..', '..');
const ctx = (resolvedUrl: string) => ({ req: {} as never, res: {} as never, resolvedUrl });

describe('/admin', () => {
  it('src/pages/admin altındaki her sayfa (index hariç) ana sayfa listesinde', () => {
    const pages = readdirSync(path.join(SRC, 'pages/admin'))
      .filter((f) => f.endsWith('.tsx') && f !== 'index.tsx')
      .map((f) => `/admin/${f.replace(/\.tsx$/, '')}`)
      .sort();
    expect(ADMIN_PAGES.map((p) => p.path).sort()).toEqual(pages);
    for (const p of ADMIN_PAGES) expect(p.description.length).toBeGreaterThan(10);
  });

  it('kapı: oturumsuz → girişe (dönüş adresiyle), ADMIN değil → 404, ADMIN → sayfa', async () => {
    session.value = null;
    expect(await adminPageGuard(ctx('/admin?x=1'))).toEqual({
      redirect: { destination: '/auth/signin?callbackUrl=%2Fadmin', permanent: false },
    });
    session.value = { user: { role: 'USER' } };
    expect(await adminPageGuard(ctx('/admin/sikayetler'))).toEqual({ notFound: true });
    session.value = { user: { role: 'ADMIN' } };
    expect(await adminPageGuard(ctx('/admin'))).toEqual({ props: {} });
  });

  it('kartlar: başlık, açıklama, bağlantı; sayaç yalnız > 0 iken rozet', () => {
    const html = renderToStaticMarkup(<AdminHome counters={{ openReports: 4, pendingDrafts: 0 }} />);
    for (const p of ADMIN_PAGES) {
      expect(html).toContain(`href="${p.path}"`);
      expect(html).toContain(p.title.replace(/&/g, '&amp;'));
    }
    expect(html).toContain('aria-label="4 bekleyen"');
    expect(html).not.toContain('0 bekleyen');
  });

  it('her yönetici sayfası noindex ve üstünde "Admin paneli" geri bağlantısı', () => {
    for (const f of readdirSync(path.join(SRC, 'pages/admin'))) {
      const src = readFileSync(path.join(SRC, 'pages/admin', f), 'utf8');
      expect(src, f).toContain('content="noindex, nofollow"');
      expect(src, f).toContain('adminPageGuard');
      if (f !== 'index.tsx') expect(src, f).toContain('<AdminNav />');
    }
  });

  it('kullanıcıya görünen sitede, robots.txt ve sitemap\'te /admin bağlantısı yok', () => {
    const files = ['components/Footer/index.tsx', 'components/BottomNav/index.tsx', 'pages/robots.txt.tsx', 'pages/sitemap.xml.tsx'];
    for (const dir of ['components/Header']) for (const f of readdirSync(path.join(SRC, dir))) if (f.endsWith('.tsx')) files.push(`${dir}/${f}`);
    for (const f of files) expect(readFileSync(path.join(SRC, f), 'utf8'), f).not.toMatch(/['"`]\/admin/);
  });
});
