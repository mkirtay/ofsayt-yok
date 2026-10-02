/** İletişim sayfası (bkz. comparePage.i18n.test.tsx — sayfa testleri `src/pages` dışında durur). */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import trLegal from '../../../public/locales/tr/legal.json';
import enLegal from '../../../public/locales/en/legal.json';

const locale = vi.hoisted(() => ({ value: 'tr' }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ locale: locale.value, setLocale: () => {} }) }));

import IletisimPage from '@/pages/iletisim';

const ADDRESS = 'iletisim@ofsaytyok.app';

describe('İletişim sayfası', () => {
  it.each(['tr', 'en'])('%s: adres iletisim@ofsaytyok.app (mailto), yer tutucu notu yok', (lang) => {
    locale.value = lang;
    const html = renderToStaticMarkup(<IletisimPage />);
    expect(html).toContain(`href="mailto:${ADDRESS}"`);
    expect(html).toContain(`>${ADDRESS}</a>`);
    expect(html).not.toMatch(/yer tutucu|placeholder/i);
  });

  it('iki dilde de aynı adres; contact bölümünde taslak notu anahtarı yok', () => {
    for (const legal of [trLegal, enLegal]) {
      expect(legal.contact.email).toBe(ADDRESS);
      expect(legal.contact).not.toHaveProperty('draftNotice');
      expect(legal.contact).not.toHaveProperty('emailPlaceholder');
    }
  });
});
