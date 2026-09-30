import { describe, it, expect, vi } from 'vitest';
import { installLazySentry } from './lazySentry';

function fakeWindow() {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  return {
    addEventListener: (t: string, fn: (e: Event) => void) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(fn),
    removeEventListener: (t: string, fn: (e: Event) => void) => void listeners.get(t)?.delete(fn),
    fire: (t: string, e: object) => [...(listeners.get(t) ?? [])].forEach((fn) => fn(e as Event)),
    count: (t: string) => listeners.get(t)?.size ?? 0,
  };
}

function fakeSentry() {
  return { init: vi.fn(), captureException: vi.fn() };
}

describe('installLazySentry', () => {
  it('açılışta SDK yüklenmez; ilk hatada yüklenir ve ilk hata (ve yükleme sırasında gelenler) gönderilir', async () => {
    const w = fakeWindow();
    const sentry = fakeSentry();
    let resolveLoad!: (s: typeof sentry) => void;
    const load = vi.fn(() => new Promise<typeof sentry>((r) => (resolveLoad = r)));
    const ctl = installLazySentry({ target: w as never, enabled: true, options: { dsn: 'https://k@o.ingest.de.sentry.io/1' }, load });

    expect(load).not.toHaveBeenCalled();

    const first = new Error('ilk hata');
    w.fire('error', { error: first, message: 'ilk hata' });
    w.fire('unhandledrejection', { reason: 'ret' });
    expect(load).toHaveBeenCalledTimes(1); // ikinci olay yeni yükleme başlatmaz

    resolveLoad(sentry);
    await ctl.loaded();

    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(sentry.captureException.mock.calls.map((c) => c[0])).toEqual([first, 'ret']);
    // SDK kendi yakalayıcılarıyla devralır → bizimkiler kaldırıldı (çift kayıt yok)
    expect(w.count('error')).toBe(0);
    expect(w.count('unhandledrejection')).toBe(0);
  });

  it('yükleme başarısızsa tampon korunur, sıradaki hatada yeniden denenir', async () => {
    const w = fakeWindow();
    const sentry = fakeSentry();
    const load = vi.fn().mockRejectedValueOnce(new Error('ağ')).mockResolvedValueOnce(sentry);
    const ctl = installLazySentry({ target: w as never, enabled: true, options: { dsn: 'x' }, load });

    const a = new Error('a');
    w.fire('error', { error: a });
    await ctl.loaded()?.catch(() => {});
    await Promise.resolve();

    const b = new Error('b');
    w.fire('error', { error: b });
    await ctl.loaded();

    expect(load).toHaveBeenCalledTimes(2);
    expect(sentry.captureException.mock.calls.map((c) => c[0])).toEqual([a, b]);
  });

  it('kapalıyken (preview/yerel) ya da DSN yokken hiçbir şey dinlenmez', () => {
    const w = fakeWindow();
    const load = vi.fn();
    installLazySentry({ target: w as never, enabled: false, options: { dsn: 'x' }, load });
    installLazySentry({ target: w as never, enabled: true, options: {}, load });
    expect(w.count('error')).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });
});
