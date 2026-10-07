/** İletişim sayfası (bkz. comparePage.i18n.test.tsx — sayfa testleri `src/pages` dışında durur). */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trLegal from '../../../public/locales/tr/legal.json';
import enLegal from '../../../public/locales/en/legal.json';

const locale = vi.hoisted(() => ({ value: 'tr' }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: locale.value, setLocale: () => {} }) }));

import IletisimPage from '@/pages/iletisim';
import { BRAND } from '@/config/brand';

const ADDRESS = BRAND.contactEmail;

describe('İletişim sayfası', () => {
  it.each(['tr', 'en'])('%s: adres BRAND.contactEmail (mailto), yer tutucu notu yok, doldurulmamış {{…}} yok', (lang) => {
    locale.value = lang;
    const html = renderToStaticMarkup(<IletisimPage />);
    expect(html).toContain(`href="mailto:${ADDRESS}"`);
    expect(html).toContain(`>${ADDRESS}</a>`);
    expect(html).not.toMatch(/yer tutucu|placeholder/i);
    expect(html).not.toContain('{{');
  });

  it('iki dilde de adres marka değişkeni; contact bölümünde taslak notu anahtarı yok', () => {
    for (const legal of [trLegal, enLegal]) {
      expect(legal.contact.email).toBe('{{contactEmail}}');
      expect(legal.contact).not.toHaveProperty('draftNotice');
      expect(legal.contact).not.toHaveProperty('emailPlaceholder');
    }
  });
});
