import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import BrandLogo from './index';
import { BRAND } from '@/config/brand';
import { BRAND_LOGO_SVG_ON_DARK, BRAND_LOGO_SVG_ON_LIGHT } from '@/config/brandImages';

const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

describe('BrandLogo', () => {
  it('sabit zemin: tek görsel, doğru varyant, oranlı genişlik, marka adı alt metni', () => {
    const dark = imgs(renderToStaticMarkup(<BrandLogo surface="dark" height={34} />));
    expect(dark).toHaveLength(1);
    expect(dark[0]).toContain(`src="${BRAND_LOGO_SVG_ON_DARK}"`);
    expect(dark[0]).toContain('width="102"');
    expect(dark[0]).toContain('height="34"');
    expect(dark[0]).toContain(`alt="${BRAND.name}"`);
    const light = imgs(renderToStaticMarkup(<BrandLogo surface="light" height={28} />));
    expect(light).toHaveLength(1);
    expect(light[0]).toContain(`src="${BRAND_LOGO_SVG_ON_LIGHT}"`);
    expect(light[0]).toContain('width="84"');
  });

  it('surface="theme": iki varyant da SSR çıktısında (seçim CSS ile, JS beklemeden)', () => {
    const both = imgs(renderToStaticMarkup(<BrandLogo surface="theme" height={34} />));
    expect(both).toHaveLength(2);
    expect(both[0]).toContain(BRAND_LOGO_SVG_ON_DARK);
    expect(both[1]).toContain(BRAND_LOGO_SVG_ON_LIGHT);
    const scss = readFileSync(path.join(__dirname, 'brandLogo.module.scss'), 'utf8');
    expect(scss).toContain(":global(:root[data-theme='light'])");
  });

  it('header ve footer koyu zemin varyantını kullanır (ikisi de her temada koyu)', () => {
    const read = (f: string) => readFileSync(path.join(process.cwd(), 'src/components', f), 'utf8');
    expect(read('Header/index.tsx')).toContain('<BrandLogo surface="dark"');
    expect(read('Footer/index.tsx')).toContain('<BrandLogo surface="dark"');
    expect(read('Header/index.tsx')).not.toContain('logo-black.svg');
  });
});
