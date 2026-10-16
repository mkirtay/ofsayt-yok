/** Hikie ödeme dönüşü: adresteki kişisel sorgu (customerEmail, checkoutLinkToken …) silinir; yalnız sipariş kimliği kalır. */
import { describe, expect, it } from 'vitest';
import { cleanReturnQuery, readReturnOrderId, returnUrlScriptForPage, returnUrlScrubScript, returnUrlToReplace } from './paymentReturnUrl';
import { scrubAnalyticsUrl } from './analyticsScrub';
import { scrubSecretParams, scrubSentryEvent } from './sentryScrub';
import nextConfig from '../../next.config';

const M = `oy_${'a'.repeat(32)}`;
const HIKIE = `?store=scor3&productType=link&customerEmail=ali%40example.com&checkoutLinkToken=tok_123`;

/** _document betiğini sahte window'da çalıştırır; son adresi döner. */
function runScript(keep: boolean, href: string): string {
  const url = new URL(href);
  let current = url.pathname + url.search + url.hash;
  const location = { pathname: url.pathname, search: url.search, hash: url.hash };
  const history = { state: null, replaceState: (_s: unknown, _t: string, u: string) => (current = u) };
  new Function('window', 'history', 'URLSearchParams', returnUrlScrubScript(keep))({ location }, history, URLSearchParams);
  return current;
}

describe('ödeme dönüş adresi', () => {
  it('yalnız geçerli merchantOrderId kalır; Hikie parametreleri ve hash gider', () => {
    expect(readReturnOrderId(`${HIKIE}&merchantOrderId=${M}`)).toBe(M);
    expect(readReturnOrderId('?merchantOrderId=http://evil')).toBeNull();
    expect(cleanReturnQuery(HIKIE)).toBe('');
    expect(cleanReturnQuery(`${HIKIE}&merchantOrderId=${M}`)).toBe(`?merchantOrderId=${M}`);
    expect(cleanReturnQuery(`?merchantOrderId=${M}`, false)).toBe('');
    expect(returnUrlToReplace('/odeme/tamamlandi', HIKIE, '')).toBe('/odeme/tamamlandi');
    expect(returnUrlToReplace('/odeme/tamamlandi', `?merchantOrderId=${M}`, '')).toBeNull();
    expect(returnUrlToReplace('/odeme/tamamlandi', '', '')).toBeNull();
    expect(returnUrlToReplace('/en/odeme/tekrar-dene', '', '#x', false)).toBe('/en/odeme/tekrar-dene');
  });

  it('_document satır içi betiği: e-posta ve belirteç adresten silinir (ilk yüklemede, Next / analitikten önce)', () => {
    expect(runScript(true, `https://x.test/odeme/tamamlandi${HIKIE}`)).toBe('/odeme/tamamlandi');
    expect(runScript(true, `https://x.test/odeme/tamamlandi${HIKIE}&merchantOrderId=${M}`)).toBe(`/odeme/tamamlandi?merchantOrderId=${M}`);
    expect(runScript(false, `https://x.test/en/odeme/tekrar-dene${HIKIE}#h`)).toBe('/en/odeme/tekrar-dene');
    expect(runScript(true, `https://x.test/odeme/tamamlandi?merchantOrderId=${M}`)).toBe(`/odeme/tamamlandi?merchantOrderId=${M}`);
  });

  it('betik yalnız iki ödeme dönüş sayfasının HTML\'ine girer', () => {
    expect(returnUrlScriptForPage('/odeme/tamamlandi')).toBe(returnUrlScrubScript(true));
    expect(returnUrlScriptForPage('/odeme/tekrar-dene')).toBe(returnUrlScrubScript(false));
    expect(returnUrlScriptForPage('/')).toBeNull();
    expect(returnUrlScriptForPage('/credits')).toBeNull();
  });

  it('Vercel Web Analytics: /odeme/* sorgusuz; diğer sayfalarda e-posta / belirteç parametreleri silinir', () => {
    expect(scrubAnalyticsUrl(`https://x.test/odeme/tamamlandi${HIKIE}`)).toBe('https://x.test/odeme/tamamlandi');
    expect(scrubAnalyticsUrl(`https://x.test/en/odeme/tamamlandi${HIKIE}`)).toBe('https://x.test/en/odeme/tamamlandi');
    expect(scrubAnalyticsUrl('https://x.test/auth/reset-password?token=abc&utm_source=x')).toBe('https://x.test/auth/reset-password?utm_source=x');
    expect(scrubAnalyticsUrl('https://x.test/?customerEmail=a%40b.c&checkoutLinkToken=t&tab=leagues')).toBe('https://x.test/?tab=leagues');
  });

  it('Sentry: customerEmail / checkoutLinkToken / email parametreleri gizlenir', () => {
    const out = scrubSecretParams(`/odeme/tamamlandi${HIKIE}&email=a@b.c`);
    expect(out).not.toMatch(/ali%40example|tok_123|a@b\.c/);
    expect(out).toContain('store=scor3');
    const ev = scrubSentryEvent({ request: { url: `https://x.test/odeme/tamamlandi${HIKIE}`, query_string: HIKIE.slice(1) } } as never) as {
      request: { url: string; query_string: string };
    };
    expect(JSON.stringify(ev)).not.toMatch(/ali%40example|tok_123/);
  });

  it('/odeme/* yanıtları Referrer-Policy: no-referrer (genel kuralı ezer); diğer sayfalar değişmez', async () => {
    const rules = await nextConfig.headers!();
    const policyFor = (p: string) => {
      let v: string | undefined;
      for (const r of rules) {
        const re = new RegExp(`^${r.source.replace(/\/:path\*$/, '(?:/.*)?')}$`);
        if (re.test(p)) for (const h of r.headers) if (h.key === 'Referrer-Policy') v = h.value;
      }
      return v;
    };
    expect(policyFor('/odeme/tamamlandi')).toBe('no-referrer');
    expect(policyFor('/odeme/tekrar-dene')).toBe('no-referrer');
    expect(policyFor('/credits')).toBe('strict-origin-when-cross-origin');
  });
});
