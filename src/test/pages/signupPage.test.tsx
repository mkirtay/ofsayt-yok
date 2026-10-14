/** Kayıt sayfası: boş alanda kural listesi, göster/gizle düğmesi, fayda satırları (bkz. creditsPage.test.tsx). */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trAuth from '../../../public/locales/tr/auth.json';
import enAuth from '../../../public/locales/en/auth.json';
import trMatch from '../../../public/locales/tr/match.json';
import enMatch from '../../../public/locales/en/match.json';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], trAuth);
      return typeof v === 'string' ? v : key;
    },
  }),
}));
vi.mock('next/router', () => ({ useRouter: () => ({ query: {}, push: async () => true }) }));
vi.mock('@/hooks/useRedirectIfSignedIn', () => ({ useRedirectIfSignedIn: () => {} }));
vi.mock('@/components/AuthStage', () => ({ default: () => null }));
vi.mock('@/components/GoogleSignInButton', () => ({ default: () => null }));

import SignUpPage from '@/pages/auth/signup';

const html = () => renderToStaticMarkup(<SignUpPage googleEnabled={false} />);

describe('Kayıt sayfası', () => {
  it('şifre boşken de 5 kural listede (nötr ○, ✗ yok) ve alan listeye aria-describedby ile bağlı', () => {
    const out = html();
    for (const key of ['minLength', 'lowercase', 'uppercase', 'digit', 'special'] as const) {
      expect(out).toContain(trAuth.password[key]);
    }
    expect(out.match(/○/g)).toHaveLength(5);
    expect(out).not.toContain('✗');
    expect(out).toContain('id="signup-password-rules"');
    expect(out).toMatch(/<input id="signup-password"[^>]*aria-describedby="signup-password-rules"/);
  });

  it('göster/gizle: type=button, aria-label "Şifreyi göster", aria-pressed=false, alan type=password', () => {
    const out = html();
    expect(out).toMatch(/<input id="signup-password"[^>]*type="password"/);
    expect(out).toMatch(/<button type="button"[^>]*aria-label="Şifreyi göster"[^>]*aria-pressed="false"[^>]*aria-controls="signup-password"/);
  });

  it('fayda satırları gerçek faydalar (2 kredi, haftalık 1 analiz)', () => {
    const out = html();
    expect(out).toContain(trAuth.signUp.benefitVerify);
    expect(out).toContain(trAuth.signUp.benefitWeekly);
    expect(trAuth.signUp.benefitVerify).toContain('2');
    expect(enAuth.signUp.benefitVerify).toContain('2');
  });

  it('metinler: Turnstile yardımcı metni Türkçe karakterli; yeni anahtarlar iki dilde de var', () => {
    expect(trAuth.signUp.completeVerificationFirst).toBe('Kayıt için önce güvenlik doğrulamasını tamamlayın.');
    for (const k of ['benefitsLabel', 'benefitVerify', 'benefitWeekly'] as const) expect(enAuth.signUp[k]).toBeTruthy();
    for (const k of ['show', 'hide'] as const) expect(enAuth.password[k]).toBeTruthy();
    expect(trMatch.hub.homeHeading).toContain('{{brand}}');
    expect(enMatch.hub.homeHeading).toContain('{{brand}}');
  });
});
