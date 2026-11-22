import { afterEach, describe, expect, it, vi } from 'vitest';
import { anyTrackerConfigured, clearGaCookies, clearMetaCookies, gaMeasurementId, metaPixelId } from './analyticsConsent';

describe('gaMeasurementId', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('yalnız geçerli G- kimliği; yoksa GA ve onay bandı kapalı', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    expect(gaMeasurementId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'UA-123');
    expect(gaMeasurementId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GA_ID', ' G-AB12CD34EF ');
    expect(gaMeasurementId()).toBe('G-AB12CD34EF');
  });
});

describe('metaPixelId / anyTrackerConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('yalnız 15–16 haneli sayı (trim); aksi null', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
    expect(metaPixelId()).toBeNull();
    for (const bad of ['12345678901234', '12345678901234567', '20780662728878a', 'abc', '2078066272887823;x']) {
      vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', bad);
      expect(metaPixelId()).toBeNull();
    }
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', ' 2078066272887823 ');
    expect(metaPixelId()).toBe('2078066272887823');
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '207806627288782');
    expect(metaPixelId()).toBe('207806627288782');
  });

  it("bant / footer bağlantısı: GA veya Pixel'den biri yeter", () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
    expect(anyTrackerConfigured()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '2078066272887823');
    expect(anyTrackerConfigured()).toBe(true);
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-AB12CD34EF');
    expect(anyTrackerConfigured()).toBe(true);
  });
});

describe('çerez temizleme', () => {
  afterEach(() => vi.unstubAllGlobals());

  function fakeBrowser(cookie: string) {
    const writes: string[] = [];
    vi.stubGlobal('window', { location: { hostname: 'www.getscor3.com' } });
    vi.stubGlobal('document', {
      get cookie() {
        return cookie;
      },
      set cookie(v: string) {
        writes.push(v);
      },
    });
    return writes;
  }

  const COOKIES = '_fbp=fb.1.1.2; _fbc=fb.1.1.abc; _ga=GA1.1.1; _ga_ABC=GS1; next-auth.session-token=x; _fbpx=1';

  it('clearMetaCookies yalnız _fbp ve _fbc; tam ve üst alan adında (GA ile aynı mantık)', () => {
    const writes = fakeBrowser(COOKIES);
    clearMetaCookies();
    const names = new Set(writes.map((w) => w.split('=')[0]));
    expect([...names].sort()).toEqual(['_fbc', '_fbp']);
    expect(writes).toContain('_fbp=; Max-Age=0; path=/');
    expect(writes).toContain('_fbp=; Max-Age=0; path=/; domain=www.getscor3.com');
    expect(writes).toContain('_fbp=; Max-Age=0; path=/; domain=.getscor3.com');
    expect(writes).toHaveLength(6);
  });

  it('clearGaCookies Meta çerezlerine dokunmaz', () => {
    const writes = fakeBrowser(COOKIES);
    clearGaCookies();
    expect(new Set(writes.map((w) => w.split('=')[0]))).toEqual(new Set(['_ga', '_ga_ABC']));
  });
});
