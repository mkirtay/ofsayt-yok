import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const router = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('../Header', () => ({ default: () => <header /> }));
vi.mock('../Footer', () => ({ default: () => <footer /> }));
vi.mock('../SponsorSlider', () => ({ default: () => null }));
vi.mock('../BottomNav', () => ({ default: () => null }));
vi.mock('../KuralKosesi/Mount', () => ({ default: () => null }));
vi.mock('./layout.module.scss', () => ({
  default: { shell: 'shell', main: 'main', mainFill: 'mainFill', sponsor: 'sponsor' },
}));

import Layout from './index';
import { usesStaticPageLayout } from './staticPageLayout';

const render = (pathname: string) => {
  router.pathname = pathname;
  return renderToStaticMarkup(<Layout>içerik</Layout>);
};

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
const rule = (scss: string, sel: string) => scss.slice(scss.indexOf(`${sel} {`), scss.indexOf('}', scss.indexOf(`${sel} {`)));

describe('usesStaticPageLayout', () => {
  it('statik sayfalar ve giriş/kayıt sayfaları evet; veri yüklenen sayfalar hayır', () => {
    for (const p of ['/iletisim', '/gizlilik-politikasi', '/kullanim-sartlari', '/credits', '/404', '/500', '/auth/signin', '/auth/signup']) {
      expect(usesStaticPageLayout(p)).toBe(true);
    }
    for (const p of ['/', '/teams/[id]', '/matches/[id]', '/profile', '/ai-istatistikleri', '/standings', '/authx']) {
      expect(usesStaticPageLayout(p)).toBe(false);
    }
  });
});

describe('<Layout />', () => {
  it('statik sayfa: sütun kabuğu, main en az ekran boyu almaz (footer içerik kısaysa ekranın altına oturur)', () => {
    const html = render('/iletisim');
    expect(html).toMatch(/^<div class="shell"><header><\/header><main class="main">içerik<\/main><div class="container sponsor"><\/div><footer><\/footer><\/div>$/);
  });

  it('veri yüklenen sayfa: main en az ekran boyu (footer ilk boyamada ekran dışında → CLS 0)', () => {
    const html = render('/teams/[id]');
    expect(html).toContain('<main class="main mainFill">');
    expect(html).not.toContain('class="shell"');
  });

  it('stiller: 100vh yalnız .shell ve .mainFill\'de; .main kalan boşluğu doldurur; auth sarmalayıcısında 100vh yok', () => {
    const scss = read('src/components/Layout/layout.module.scss');
    expect(rule(scss, '.shell')).toMatch(/display: flex;\s*flex-direction: column;\s*min-height: 100vh;\s*min-height: 100svh;/);
    expect(rule(scss, '.main')).toMatch(/flex: 1 0 auto;/);
    expect(rule(scss, '.main')).not.toMatch(/min-height/);
    expect(rule(scss, '.mainFill')).toMatch(/min-height: calc\(100vh - var\(--header-height\)\)/);
    expect(read('src/pages/auth/auth.module.scss')).not.toMatch(/100vh/);
  });
});
