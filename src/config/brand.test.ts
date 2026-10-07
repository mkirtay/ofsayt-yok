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

  it('iletişim adresi gerçek bir alan adında (yer tutucu canlıya çıkmasın)', () => {
    expect(BRAND.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
    expect(BRAND.contactEmail).not.toMatch(/\.(test|example|invalid|localhost)$|@ornek\./);
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
