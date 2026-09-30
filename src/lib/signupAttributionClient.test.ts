import { describe, it, expect, vi } from 'vitest';
import { captureSessionAttribution, markSessionAttributionSent, readSessionAttribution, sendSessionAttributionOnce } from './signupAttributionClient';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('signupAttributionClient (sessionStorage)', () => {
  it('ilk temas: oturumun ilk sayfası yazılır, sonraki sayfalar ezmez', () => {
    const s = memoryStorage();
    captureSessionAttribution('?utm_source=instagram&utm_medium=social&utm_campaign=derbi', s, new Date('2026-09-30T10:00:00Z'));
    captureSessionAttribution('?utm_source=google', s, new Date('2026-09-30T10:05:00Z'));
    expect(readSessionAttribution(s)).toEqual({
      source: 'instagram',
      medium: 'social',
      campaign: 'derbi',
      firstTouchAt: '2026-09-30T10:00:00.000Z',
    });
  });

  it('utm\'siz ilk sayfa: kaynak null, oturumun ilk giriş zamanı tutulur', () => {
    const s = memoryStorage();
    captureSessionAttribution('', s, new Date('2026-09-30T10:00:00Z'));
    expect(readSessionAttribution(s)).toEqual({ source: null, medium: null, campaign: null, firstTouchAt: '2026-09-30T10:00:00.000Z' });
  });

  it('önce utm\'siz giriş, sonra kampanya linki: utm oturumdaki ilk utm\'li girişten dolar, firstTouchAt oturum başı kalır', () => {
    const s = memoryStorage();
    captureSessionAttribution('', s, new Date('2026-09-30T10:00:00Z'));
    captureSessionAttribution('?utm_source=instagram&utm_campaign=derbi', s, new Date('2026-09-30T10:20:00Z'));
    expect(readSessionAttribution(s)).toEqual({
      source: 'instagram',
      medium: null,
      campaign: 'derbi',
      firstTouchAt: '2026-09-30T10:00:00.000Z',
    });
  });

  it('utm bir kez dolunca sonradan gelen utm (ve utm\'siz sayfalar) ezmez', () => {
    const s = memoryStorage();
    captureSessionAttribution('', s, new Date('2026-09-30T10:00:00Z'));
    captureSessionAttribution('?utm_source=instagram', s, new Date('2026-09-30T10:20:00Z'));
    captureSessionAttribution('?utm_source=google&utm_medium=cpc', s, new Date('2026-09-30T10:40:00Z'));
    captureSessionAttribution('', s, new Date('2026-09-30T10:50:00Z'));
    expect(readSessionAttribution(s)).toEqual({ source: 'instagram', medium: null, campaign: null, firstTouchAt: '2026-09-30T10:00:00.000Z' });
  });

  it('geçersiz utm değeri utm sayılmaz (sonraki geçerli utm doldurabilir)', () => {
    const s = memoryStorage();
    captureSessionAttribution('?utm_source=%3Cscript%3E', s, new Date('2026-09-30T10:00:00Z'));
    captureSessionAttribution('?utm_source=newsletter', s, new Date('2026-09-30T10:05:00Z'));
    expect(readSessionAttribution(s)).toMatchObject({ source: 'newsletter', firstTouchAt: '2026-09-30T10:00:00.000Z' });
  });

  it('oturum sonrası gönderim bir kez; e-posta kaydında gönderildiyse hiç', async () => {
    const s = memoryStorage();
    captureSessionAttribution('?utm_source=x', s);
    const fetchImpl = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
    await sendSessionAttributionOnce(s, fetchImpl);
    await sendSessionAttributionOnce(s, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const s2 = memoryStorage();
    captureSessionAttribution('?utm_source=x', s2);
    markSessionAttributionSent(s2);
    await sendSessionAttributionOnce(s2, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('depolama yoksa (gizli mod) sessizce geçer', async () => {
    expect(() => captureSessionAttribution('?utm_source=x', null)).not.toThrow();
    expect(readSessionAttribution(null)).toBeNull();
    await expect(sendSessionAttributionOnce(null)).resolves.toBeUndefined();
  });
});
