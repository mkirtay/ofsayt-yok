/** Kredi sayfası rozetleri (bkz. comparePage.i18n.test.tsx — sayfa testleri `src/pages` dışında durur). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trCredits from '../../../public/locales/tr/credits.json';

const s = vi.hoisted(() => ({ role: 'USER' as string, credits: 5, premiumUntil: null as string | null }));
vi.mock('@/lib/i18n', () => ({
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

import CreditsPage from '@/pages/credits';

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

  it('premiumUntil gelecekte → PREMIUM rozeti', () => {
    s.premiumUntil = new Date(Date.now() + 86_400_000).toISOString();
    expect(render()).toContain('>PREMIUM<');
  });

  it('kredi modeli v2 fiyatları (KDV dahil, "Yakında"): 10 / 30 / 100 kredi, premium aylık / yıllık, 4 ay bedava', () => {
    const html = render();
    for (const price of ['39,99 TL', '99,99 TL', '249,99 TL', '799,99 TL']) expect(html).toContain(price);
    expect(html).toContain('Kredi başı 4,00 TL'); // 39,99 / 10
    expect(html).toContain('Kredi başı 2,50 TL'); // 249,99 / 100
    expect(html).toContain('4 ay bedava');
    expect(html).toContain('En popüler');
    expect(html).toContain(trCredits.vatIncluded);
    expect(html).toContain(trCredits.free1);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(5); // 3 paket + 2 plan
  });

  it('satıştaki paket "Satın al" (aktif), diğerleri "Yakında"; kredi paketi satıştaysa "yakında" bandı yok', () => {
    const html = renderToStaticMarkup(<CreditsPage availablePackages={['credits_10', 'premium_30d']} />);
    expect((html.match(/disabled=""/g) ?? []).length).toBe(3);
    expect((html.match(/>Satın al</g) ?? []).length).toBe(2);
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
});
