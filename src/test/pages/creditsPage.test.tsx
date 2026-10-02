/** Kredi sayfası rozetleri (bkz. comparePage.i18n.test.tsx — sayfa testleri `src/pages` dışında durur). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trCredits from '../../../public/locales/tr/credits.json';

const s = vi.hoisted(() => ({ role: 'USER' as string, credits: 5 }));
vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => { const v = (trCredits as Record<string, unknown>)[key]; return typeof v === 'string' ? v : key; } }),
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { role: s.role, credits: s.credits } } }),
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

  it('paketlerdeki premium notu şimdilik duruyor (paketler "Yakında")', () => {
    expect(render()).toContain(trCredits.premiumNote.replace(/'/g, '&#x27;'));
  });
});
