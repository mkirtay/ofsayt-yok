import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureFbqStub, flushRegistrationEvent, isSensitiveUrl, markRegistrationCompleted, type Fbq } from './metaPixel';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe('isSensitiveUrl — bu adreslerde Meta olayı gitmez', () => {
  it.each([
    'https://www.getscor3.com/odeme/basarili?customerEmail=a%40b.com',
    'https://www.getscor3.com/auth/reset-password?token=abc',
    'https://www.getscor3.com/auth/verify-email-sent?email=a%40b.com',
  ])('hassas: %s', (u) => expect(isSensitiveUrl(u)).toBe(true));

  it.each([
    'https://www.getscor3.com/',
    'https://www.getscor3.com/matches/123?sekme=ai-analiz',
    'https://www.getscor3.com/?utm_source=instagram&utm_campaign=x',
  ])('normal: %s', (u) => expect(isSensitiveUrl(u)).toBe(false));
});

describe('ensureFbqStub', () => {
  it('çağrıları kuyruğa alır, push-state otomatik PageView kapalı, var olanı ezmez', () => {
    const w = {} as Window;
    const fbq = ensureFbqStub(w);
    fbq('init', '2078066272887823');
    expect(fbq.queue).toEqual([['init', '2078066272887823']]);
    expect(fbq.disablePushState).toBe(true);
    expect(w._fbq).toBe(fbq);
    expect(ensureFbqStub(w)).toBe(fbq);
  });
});

describe('CompleteRegistration', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '2078066272887823');
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const HOME = 'https://www.getscor3.com/';

  it('oturumda bir kez; olayda parametre (kişisel veri) yok', () => {
    const s = memoryStorage();
    const fbq = vi.fn() as unknown as Fbq;
    markRegistrationCompleted(s);
    expect(flushRegistrationEvent({ granted: true, href: HOME, fbq, storage: s })).toBe(true);
    expect(fbq).toHaveBeenCalledWith('track', 'CompleteRegistration');
    expect((fbq as unknown as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(2);
    markRegistrationCompleted(s);
    expect(flushRegistrationEvent({ granted: true, href: HOME, fbq, storage: s })).toBe(false);
    expect(fbq).toHaveBeenCalledTimes(1);
  });

  it('kayıt yoksa, onay yoksa ya da adres hassassa gitmez (bekler)', () => {
    const s = memoryStorage();
    const fbq = vi.fn() as unknown as Fbq;
    expect(flushRegistrationEvent({ granted: true, href: HOME, fbq, storage: s })).toBe(false);
    markRegistrationCompleted(s);
    expect(flushRegistrationEvent({ granted: false, href: HOME, fbq, storage: s })).toBe(false);
    expect(
      flushRegistrationEvent({ granted: true, href: `${HOME}auth/verify-email-sent?email=a%40b.com`, fbq, storage: s }),
    ).toBe(false);
    expect(fbq).not.toHaveBeenCalled();
    expect(flushRegistrationEvent({ granted: true, href: HOME, fbq, storage: s })).toBe(true);
  });

  it('Pixel kimliği yoksa gitmez', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
    const s = memoryStorage();
    const fbq = vi.fn() as unknown as Fbq;
    markRegistrationCompleted(s);
    expect(flushRegistrationEvent({ granted: true, href: HOME, fbq, storage: s })).toBe(false);
  });
});
