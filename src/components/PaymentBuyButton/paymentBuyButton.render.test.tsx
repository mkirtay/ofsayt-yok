import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated' }) }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: 'en' }) }));

import PaymentBuyButton, { checkoutRequestBody } from '.';
import { PURCHASE_TERMS_VERSION } from '@/config/legalConsent';

const labels = { buy: 'Satın al', loading: '…', soon: 'Çok yakında', error: 'hata', unavailable: 'yok', termsRequired: 'onay' };
const btn = (available: boolean, termsAccepted: boolean) =>
  renderToStaticMarkup(
    <PaymentBuyButton packageKey="credits_10" available={available} termsAccepted={termsAccepted} describedBy="c" labels={labels} className="b" activeClassName="a" errorClassName="e" />,
  );

describe('PaymentBuyButton — satın alma onayı', () => {
  it('onay yokken pasif, onaylıyken aktif; satışta değilse her durumda "Çok yakında"', () => {
    expect(btn(true, false)).toMatch(/disabled=""/);
    expect(btn(true, true)).not.toMatch(/disabled=""/);
    expect(btn(true, true)).toContain('aria-describedby="c"');
    expect(btn(false, true)).toContain('>Çok yakında<');
    expect(btn(false, true)).toMatch(/disabled=""/);
  });

  it('istek gövdesi: acceptedTerms true + sunucunun sürümü + dil (yalnız tr / en)', () => {
    expect(checkoutRequestBody('credits_10', 'en')).toEqual({ packageKey: 'credits_10', acceptedTerms: true, termsVersion: PURCHASE_TERMS_VERSION, locale: 'en' });
    expect(checkoutRequestBody('credits_10', 'de').locale).toBe('tr');
  });
});
