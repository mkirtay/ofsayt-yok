import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BRAND, BRAND_I18N_VARS, brandText, brandTitle, socialProfileUrls, withBrandText } from './brand';
import { I18nProvider, useTranslation } from '@/lib/i18n';
import { buildRobotsTxt } from '@/pages/robots.txt';

describe('marka yardımcıları', () => {
  it('brandText yalnız marka değişkenlerini doldurur; diğer yer tutucular aynen kalır', () => {
    expect(brandText('{{brand}} · {{siteDomain}} · {{contactEmail}} · {{name}}')).toBe(
      `${BRAND.name} · ${BRAND.domain} · ${BRAND.contactEmail} · {{name}}`,
    );
  });

  it('withBrandText sözlüğü derinlemesine doldurur, şekli korur', () => {
    const dict = { a: '{{brand}}', b: { c: ['x {{siteDomain}}', 3] }, d: null };
    expect(withBrandText(dict)).toEqual({ a: BRAND.name, b: { c: [`x ${BRAND.domain}`, 3] }, d: null });
  });

  it('brandTitle: "Başlık | Marka" ve "—" ayırıcısı', () => {
    expect(brandTitle('Puan Durumu')).toBe(`Puan Durumu | ${BRAND.name}`);
    expect(brandTitle('Gizlilik', '—')).toBe(`Gizlilik — ${BRAND.name}`);
  });

  it('domain siteUrl host’u; siteUrl sonda "/" taşımaz', () => {
    expect(BRAND.siteUrl).not.toMatch(/\/$/);
    expect(BRAND.siteUrl.endsWith(`//${BRAND.domain}`)).toBe(true);
    expect(BRAND_I18N_VARS).toEqual({ brand: BRAND.name, siteDomain: BRAND.domain, contactEmail: BRAND.contactEmail });
  });

  it('boş sosyal hesaplar sameAs\'a girmez', () => {
    const filled = Object.values(BRAND.social).filter(Boolean).length;
    expect(socialProfileUrls()).toHaveLength(filled);
  });

  it('robots.txt Sitemap satırı verilen kökten', () => {
    expect(buildRobotsTxt('https://ornek.test')).toContain('Sitemap: https://ornek.test/sitemap.xml');
  });
});

describe('i18n t(): marka değişkenleri', () => {
  function Probe() {
    const { t } = useTranslation('common');
    return createElement('p', null, `${t('footer.copyright', { year: 2026 })}|${t('gundem:notifications.official')}`);
  }

  it('opts verilse de verilmese de {{brand}} dolar', () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(Probe)));
    expect(html).toContain(`© 2026 ${BRAND.name}.`);
    expect(html).toContain(`|${BRAND.name}</p>`);
    expect(html).not.toContain('{{');
  });
});

/**
 * Koruma: marka adı / alan adı yalnız `config/brand.ts`'te yazılı kalsın (ad değişikliği tek satır olsun).
 * İzinli istisnalar: başka oturumun alanları (frikik, pitch3d), üretilmiş logo, kalıcı kimlikler (takvim UID).
 */
describe('sabit marka geçişi yok', () => {
  const ROOT = process.cwd();
  const PATTERN = /Ofsayt Yok|ofsaytyok\.app/;
  const ALLOW = [
    'src/config/brand.ts',
    'src/lib/frikik/',
    'src/components/pitch3d/',
    'src/pages/frikik.tsx',
    'public/locales/tr/frikik.json',
    'public/locales/en/frikik.json',
    'src/server/og/brandLogo.generated.ts',
    'src/components/WorldCupCalendar/index.tsx', // UID@ofsaytyok.app: kalıcı takvim kimliği
    'src/tweet-bot.js', // ayrı süreç (pm2), uygulama paketine girmez
  ];

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
    return out;
  }

  it('src (test dışı) ve çeviri dosyalarında yok', () => {
    const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'public/locales'))].filter(
      (f) => /\.(tsx?|jsx?|json)$/.test(f) && !/\.test\.tsx?$|\/test\//.test(f) && !ALLOW.some((a) => f.startsWith(a)),
    );
    const offenders = files.filter((f) =>
      readFileSync(path.join(ROOT, f), 'utf8')
        .split('\n')
        .some((line) => PATTERN.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)),
    );
    expect(offenders).toEqual([]);
  });
});
