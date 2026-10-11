import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startVisiblePolling, type VisibilityDoc } from './visiblePolling';

function fakeDoc() {
  const target = new EventTarget();
  const doc = {
    hidden: false,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    setHidden(h: boolean) {
      doc.hidden = h;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
  return doc;
}

describe('startVisiblePolling (Dünya Kupası Maçlar sekmesi)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('görünürken 30 sn\'de bir; gizliyken HİÇ çağırmaz; öne gelince bayatsa hemen bir kez', () => {
    const doc = fakeDoc();
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, 30_000, doc as unknown as VisibilityDoc);
    vi.advanceTimersByTime(60_000);
    expect(fn).toHaveBeenCalledTimes(2);

    doc.setHidden(true);
    vi.advanceTimersByTime(5 * 60_000);
    expect(fn).toHaveBeenCalledTimes(2);

    doc.setHidden(false);
    expect(fn).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(30_000);
    expect(fn).toHaveBeenCalledTimes(4);
    stop();
  });

  it('kısa süre gizlenip dönünce (son çağrı taze) ek çağrı yok; durdurunca hiç çağrı yok', () => {
    const doc = fakeDoc();
    const fn = vi.fn();
    const stop = startVisiblePolling(fn, 30_000, doc as unknown as VisibilityDoc);
    vi.advanceTimersByTime(5_000);
    doc.setHidden(true);
    doc.setHidden(false);
    expect(fn).not.toHaveBeenCalled();
    stop();
    vi.advanceTimersByTime(120_000);
    doc.setHidden(true);
    doc.setHidden(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
