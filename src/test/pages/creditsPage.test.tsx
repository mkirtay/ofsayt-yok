/** Kredi sayfası rozetleri (bkz. comparePage.i18n.test.tsx — sayfa testleri `src/pages` dışında durur). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trCredits from '../../../public/locales/tr/credits.json';

const s = vi.hoisted(() => ({ role: 'USER' as string, credits: 5, premiumUntil: null as string | null }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'tr' }),
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], trCredits);
      return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_m, n: string) => String(opts?.[n] ?? '')) : key;
    },
  }),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { role: s.role, credits: s.credits, premiumUntil: s.premiumUntil } } }),
}));
vi.mock('@/hooks/useCredits', () => ({
  useCredits: () => ({ authenticated: true, loading: false, credits: s.credits, refresh: async () => {} }),
}));

vi.mock('@/lib/serverSideTranslations', () => ({ serverSideTranslations: async () => ({}) }));

import CreditsPage, { getStaticProps } from '@/pages/credits';

const render = () => renderToStaticMarkup(<CreditsPage />);

describe('Kredi sayfası rozetleri', () => {
  beforeEach(() => {
    s.role = 'USER';
    s.credits = 5;
    s.premiumUntil = null;
  });

  it('100+ kredili kullanıcı premium değil: PREMIUM rozeti yok', () => {
    s.credits = 150;
    const html = render();
    expect(html).toContain('>150 <');
    expect(html).not.toContain('>PREMIUM<');
    expect(html).not.toContain('YÖNETİCİ');
  });

  it('yönetici: "YÖNETİCİ" rozeti, PREMIUM rozeti yok', () => {
    s.role = 'ADMIN';
    s.credits = 55;
    const html = render();
    expect(html).toContain('>YÖNETİCİ<');
    expect(html).not.toContain('>PREMIUM<');
  });

  it('premium satışı kapalı: premiumUntil gelecekte olsa da PREMIUM rozeti ve Premium bölümü yok', () => {
    s.premiumUntil = new Date(Date.now() + 86_400_000).toISOString();
    expect(render()).not.toMatch(/premium/i);
  });

  it('kredi modeli v2 fiyatları (KDV dahil, "Yakında"): 10 / 30 / 100 kredi; premium planı yok', () => {
    const html = render();
    for (const price of ['39,99 TL', '99,99 TL', '249,99 TL']) expect(html).toContain(price);
    expect(html).not.toContain('799,99 TL');
    expect(html).toContain('Kredi başı 4,00 TL'); // 39,99 / 10
    expect(html).toContain('Kredi başı 2,50 TL'); // 249,99 / 100
    expect(html).not.toContain('ay bedava');
    expect(html).toContain('En popüler');
    expect(html).toContain(trCredits.vatIncluded);
    expect(html).toContain(trCredits.free1);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3); // 3 paket
    expect(html.indexOf(trCredits.vatIncluded)).toBeGreaterThan(html.indexOf('249,99 TL')); // KDV notu paketlerin altında
  });

  it('satıştaki paket "Satın al" (aktif), diğerleri "Yakında"; kredi paketi satıştaysa "yakında" bandı yok', () => {
    const html = renderToStaticMarkup(<CreditsPage availablePackages={['credits_10', 'premium_30d']} />);
    // 2 "Yakında" + satıştaki paket de onay kutusu işaretlenene kadar pasif
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
    expect((html.match(/>Satın al</g) ?? []).length).toBe(1); // premium_30d env'i olsa da kart yok
    expect(html).not.toContain(trCredits.comingSoon);
    // Satışta paket yokken bant görünür
    expect(render()).toContain(trCredits.comingSoon);
  });

  it('1 TL test paketi yalnız yöneticiye ve yalnız satıştaysa görünür', () => {
    const avail = ['test_1tl'];
    expect(renderToStaticMarkup(<CreditsPage availablePackages={avail} />)).not.toContain(trCredits.testPackageTitle);
    s.role = 'ADMIN';
    expect(renderToStaticMarkup(<CreditsPage availablePackages={avail} />)).toContain(trCredits.testPackageTitle);
    expect(renderToStaticMarkup(<CreditsPage availablePackages={[]} />)).not.toContain(trCredits.testPackageTitle);
  });

  it('PAYMENTS_ENABLED kapalı (varsayılan): HIKIE_LINK_* + webhook tanımlı olsa da tüm düğmeler pasif "Çok yakında"', async () => {
    vi.stubEnv('HIKIE_WEBHOOK_SECRET', 'whsec');
    for (const k of ['CREDITS_10', 'CREDITS_30', 'CREDITS_100', 'TEST_1TL']) vi.stubEnv(`HIKIE_LINK_${k}`, `https://pay.example/l/${k}`);
    try {
      vi.stubEnv('PAYMENTS_ENABLED', '');
      const off = (await getStaticProps({ locale: 'tr' } as never)) as { props: { availablePackages: string[] } };
      expect(off.props.availablePackages).toEqual([]);
      s.role = 'ADMIN';
      const html = renderToStaticMarkup(<CreditsPage availablePackages={off.props.availablePackages} />);
      expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
      expect((html.match(/>Çok yakında</g) ?? []).length).toBe(3);
      expect(html).not.toContain('>Satın al<');
      expect(html).not.toContain(trCredits.testPackageTitle);

      vi.stubEnv('PAYMENTS_ENABLED', 'true');
      const on = (await getStaticProps({ locale: 'tr' } as never)) as { props: { availablePackages: string[] } };
      expect(on.props.availablePackages).toEqual(expect.arrayContaining(['credits_10', 'credits_30', 'credits_100', 'test_1tl']));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('satın alma onayı: kutu yalnız satışta paket varken; Ön Bilgilendirme + Mesafeli Satış bağlantıları yeni sekmede; işaretsizken "Satın al" pasif', () => {
    expect(render()).not.toContain('type="checkbox"'); // PAYMENTS_ENABLED kapalı → sayfa değişmez
    const html = renderToStaticMarkup(<CreditsPage availablePackages={['credits_30']} />);
    expect(html).toContain('id="purchase-consent"');
    expect(html).toMatch(/<input id="purchase-consent" type="checkbox"[^>]*>/);
    expect(html).not.toMatch(/id="purchase-consent"[^>]*checked/);
    expect(html).toMatch(/<a target="_blank" rel="noopener"[^>]*href="\/on-bilgilendirme-formu"/);
    expect(html).toMatch(/<a target="_blank" rel="noopener"[^>]*href="\/mesafeli-satis-sozlesmesi"/);
    expect(html).toContain('cayma hakkımın sona ereceğini');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="purchase-consent"[^>]*>Satın al</);
    // Onay kutusu paket kartlarından önce
    expect(html.indexOf('purchase-consent')).toBeLessThan(html.indexOf('39,99 TL'));
  });
});

