import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import facts from '@/content/kural-kosesi.json';
import type { KuralFact } from './facts';
import Launcher from './Launcher';
import Panel from './Panel';
import { getStorage, isDotHidden, markOpened, planPeek, readState, writeState } from './schedule';

// localStorage'a erişilemeyen tarayıcı: depolama yok → baloncuk ve sarı nokta çıkmaz, düğme ve panel çalışır.

const NOW = Date.UTC(2026, 9, 1, 9, 0, 0);

function blocked(): never {
  throw new DOMException('The operation is insecure.', 'SecurityError');
}

/** getItem/setItem/removeItem hata fırlatan depolama (ör. Safari gizli mod, kota 0). */
const throwingStorage: Storage = {
  length: 0,
  clear: blocked,
  getItem: blocked,
  key: blocked,
  removeItem: blocked,
  setItem: blocked,
};

function stubWindow(variant: 'methods-throw' | 'access-throws') {
  const win: Record<string, unknown> = {
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
  };
  for (const key of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(win, key, {
      get: variant === 'access-throws' ? blocked : () => throwingStorage,
    });
  }
  vi.stubGlobal('window', win);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(['methods-throw', 'access-throws'] as const)('localStorage erişilemez (%s)', (variant) => {
  it('getStorage null döner, hata fırlamaz', () => {
    stubWindow(variant);
    expect(getStorage()).toBeNull();
  });

  it('sarı nokta gizli, baloncuk hiç planlanmaz, açılış kaydı sessizce atlanır', () => {
    stubWindow(variant);
    const storage = getStorage();
    expect(isDotHidden(storage, NOW)).toBe(true);
    expect(planPeek(storage, NOW, NOW - 60_000)).toBeNull();
    expect(() => markOpened(storage, NOW)).not.toThrow();
  });

  it('düğme çizilir: aria-label var, sarı nokta ve baloncuk yok', () => {
    stubWindow(variant);
    const html = renderToStaticMarkup(<Launcher />);
    const launcher = html.match(
      /<button[^>]*aria-label="Kural Köşesi&#x27;ni aç\. Sağ kenarda\. Yukarı ve aşağı ok tuşlarıyla yerini, sol ve sağ ok tuşlarıyla kenarını değiştir\."[^>]*>([\s\S]*?)<\/button>/,
    );
    expect(launcher).not.toBeNull();
    // Kayıtlı konum okunamıyor → varsayılan yer (sağ alt).
    expect(launcher![0]).toContain('transform:translate(0px, 0px)');
    expect(launcher![0]).toContain('data-side="right"');
    // Düğmenin içinde yalnız düdük SVG'si; nokta bir <span>dı.
    expect(launcher![1]).toContain('<svg');
    expect(launcher![1]).not.toContain('<span');
    // Baloncuk ("Biliyor muydun?") yok.
    expect(html).not.toContain('Biliyor muydun?');
    // AI Asistan ✦ balonu düdükle aynı kenarda/konumda çizilir; panel kodu henüz yok (tıklayınca yüklenir).
    const assistant = html.match(/<button[^>]*aria-label="AI Asistan&#x27;ı aç"[^>]*>/);
    expect(assistant).not.toBeNull();
    expect(assistant![0]).toContain('data-side="right"');
    expect(assistant![0]).toContain('transform:translate(0px, 0px)');
    expect(html).not.toContain('role="dialog"');
  });

  it('asistanın gizlendiği sayfada ✦ balon yok, düdük var', () => {
    stubWindow(variant);
    const html = renderToStaticMarkup(<Launcher assistantHidden />);
    expect(html).not.toContain('AI Asistan');
    expect(html).toContain('Kural Köşesi');
  });

  it('panel açık çizilir: diyalog, günün bilgisi ve gezinme düğmeleri', () => {
    stubWindow(variant);
    const list = facts as unknown as KuralFact[];
    const html = renderToStaticMarkup(<Panel open facts={list} startIndex={2} onClose={() => {}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain(list[2].baslik);
    expect(html).toContain(`3 / ${list.length}`);
    expect(html).toContain('Önceki');
    expect(html).toContain('Sonraki');
  });
});

describe('depolama yarı çalışıyorsa (okuma/yazma hata fırlatır)', () => {
  it('readState boş durum döner, writeState hata fırlatmaz', () => {
    expect(readState(throwingStorage)).toEqual({});
    expect(() => writeState(throwingStorage, { openedDay: '2026-10-01' })).not.toThrow();
  });
});
