/** /hesap-silme ve /hesap-silme/onay: içerik, yer tutucular, erişilebilirlik işaretleri, canonical / noindex, bağlantılar. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import tr from '../../../public/locales/tr/accountDeletion.json';
import en from '../../../public/locales/en/accountDeletion.json';

const locale = vi.hoisted(() => ({ value: 'tr' }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: locale.value, setLocale: () => {} }),
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated' }), signOut: vi.fn() }));

import HesapSilmePage from '@/pages/hesap-silme';
import HesapSilmeOnayPage from '@/pages/hesap-silme/onay';
import { BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { linkTags, metaTags, renderHeadTags } from '@/test/headTags.testutil';
import { LEGAL_PAGES } from '@/config/legalPages';
import { usesStaticPageLayout } from '@/components/Layout/staticPageLayout';
import { shouldPromptTerms } from '@/components/TermsConsentGate';

/** JSON'daki tüm metin anahtarları (iki dil aynı şekilde mi). */
function keys(o: unknown, prefix = ''): string[] {
  if (Array.isArray(o)) return [`${prefix}[]`];
  if (o && typeof o === 'object') return Object.entries(o).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

describe('/hesap-silme', () => {
  it.each(['tr', 'en'])('%s: iki yol, profil bağlantısı, form etiketi + aria-live, iletişim adresi, yer tutucular yerinde', (lang) => {
    locale.value = lang;
    const text = lang === 'en' ? en : tr;
    const html = renderToStaticMarkup(<HesapSilmePage />);
    expect(html).toContain(`<h1`);
    expect(html).toContain(text.page.signedIn.heading);
    expect(html).toContain(text.page.signedOut.heading);
    expect(html).toContain('href="/profile#hesabi-sil"');
    // Etiket alana bağlı (for = id), alan type=email + autocomplete, ipucu aria-describedby ile.
    const id = /<label for="([^"]+)"/.exec(html)![1];
    expect(html).toMatch(new RegExp(`<input id="${id}"[^>]*type="email"[^>]*autoComplete="email"|<input id="${id}"[^>]*type="email"[^>]*autocomplete="email"`));
    expect(html).toMatch(/aria-describedby="[^"]+-hint"/);
    expect(html).toMatch(/aria-live="polite"/);
    expect(html).toContain(`href="mailto:${BRAND.contactEmail}"`);
    expect(html).toContain('[AVUKAT ONAYLI SÜRE]');
    expect(html).toContain('[ŞİRKET/KİŞİ ÜNVANI]');
    expect(html).toContain(BRAND.name);
    expect(html).not.toContain('{{');
    // Turnstile betiği ilk yükte yok (alan odaklanınca yüklenir).
    expect(html).not.toContain('challenges.cloudflare.com');
  });

  it('canonical tek ve siteBaseUrl() + /hesap-silme; noindex yok', () => {
    locale.value = 'tr';
    const tags = renderHeadTags(<HesapSilmePage />);
    expect(linkTags(tags, 'canonical').map((t) => t.props.href)).toEqual([`${siteBaseUrl()}/hesap-silme`]);
    expect(metaTags(tags, 'name', 'robots')).toEqual([]);
  });

  it('TR ve EN metinleri aynı anahtarlara sahip; "yasal saklama" ve süre bölümleri dolu', () => {
    expect(keys(en)).toEqual(keys(tr));
    expect(tr.page.deleted.length).toBe(en.page.deleted.length);
    expect(tr.page.timing).toContain('bastığınız anda gerçekleşir');
    expect(tr.page.anonymized).toContain('Silinmiş kullanıcı');
    expect(tr.page.signedOut.sent).toContain('kayıtlıysa');
    expect(en.page.signedOut.sent).toContain('If this email address is registered');
  });
});

describe('/hesap-silme/onay', () => {
  it('dizine kapalı; ilk HTML yalnız "kontrol ediliyor" (silme düğmesi JS ve geçerli belirteç olmadan görünmez)', () => {
    locale.value = 'tr';
    const html = renderToStaticMarkup(<HesapSilmeOnayPage />);
    expect(html).toContain(tr.confirm.checking);
    expect(html).not.toContain(tr.confirm.submit);
    const tags = renderHeadTags(<HesapSilmeOnayPage />);
    expect(metaTags(tags, 'name', 'robots').map((t) => t.props.content)).toEqual(['noindex, nofollow']);
  });
});

describe('site bağlantıları', () => {
  it('kısa sayfa yerleşimi ve onay kapısı muafiyeti', () => {
    expect(usesStaticPageLayout('/hesap-silme')).toBe(true);
    expect(usesStaticPageLayout('/hesap-silme/onay')).toBe(true);
    for (const pathname of ['/hesap-silme', '/hesap-silme/onay']) {
      expect(shouldPromptTerms({ status: 'authenticated', termsAccepted: false, pathname, alreadyPrompted: false })).toBe(false);
    }
  });

  it('yasal sayfa listesine girmedi (footer ayrı bağlantı); footer ve sitemap yolu içeriyor', async () => {
    expect(LEGAL_PAGES.map((p) => p.path)).not.toContain('/hesap-silme');
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/components/Footer/index.tsx', 'utf8')).toContain('href="/hesap-silme"');
    expect(readFileSync('src/pages/sitemap.xml.tsx', 'utf8')).toContain("path: '/hesap-silme'");
  });
});
