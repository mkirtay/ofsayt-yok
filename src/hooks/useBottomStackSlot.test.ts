import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOTTOM_STACK_ATTR, BOTTOM_STACK_VAR, writeBottomStack } from './useBottomStackSlot';

/** `<html>` yerine en küçük sahte: öznitelik + inline stil. */
function fakeRoot() {
  const attrs = new Set<string>();
  const props = new Map<string, string>();
  let writes = 0;
  return {
    el: {
      hasAttribute: (n: string) => attrs.has(n),
      setAttribute: (n: string) => void attrs.add(n),
      removeAttribute: (n: string) => void attrs.delete(n),
      style: {
        getPropertyValue: (n: string) => props.get(n) ?? '',
        setProperty: (n: string, v: string) => {
          writes += 1;
          props.set(n, v);
        },
        removeProperty: (n: string) => void props.delete(n),
      },
    } as unknown as HTMLElement,
    attrs,
    props,
    writes: () => writes,
  };
}

describe('alt yığın değişkeni (writeBottomStack)', () => {
  it('ölçülen yüksekliği yukarı yuvarlayıp yazar, aynı değeri tekrar yazmaz; kapanınca temizler', () => {
    const r = fakeRoot();
    writeBottomStack(r.el, 131.2);
    expect(r.props.get(BOTTOM_STACK_VAR)).toBe('132px');
    expect(r.attrs.has(BOTTOM_STACK_ATTR)).toBe(true);
    writeBottomStack(r.el, 131.9);
    expect(r.writes()).toBe(1);
    writeBottomStack(r.el, null);
    expect(r.props.has(BOTTOM_STACK_VAR)).toBe(false);
    expect(r.attrs.has(BOTTOM_STACK_ATTR)).toBe(false);
  });
});

describe('alt yığın CSS sözleşmesi', () => {
  const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), 'utf8');
  const toast = read('../components/GoalToast/goalToast.module.scss');
  const nudge = read('../components/SignupNudge/signupNudge.module.scss');

  it('gol bildirimi mobilde kartın üstüne değişkenle dizilir (sabit yükseklik yok), masaüstü kuralı değişkensiz', () => {
    const mobile = toast.slice(toast.indexOf('@include below-desktop'));
    expect(mobile).toMatch(/html\[data-bottom-stack\]/);
    expect(mobile).toMatch(/var\(--bottom-stack-offset/);
    const desktop = toast.slice(0, toast.indexOf('@include below-desktop'));
    expect(desktop).not.toMatch(/bottom-stack/);
  });

  it('kartın alt menüden boşluğu ile bildirimin hesabı aynı ($spacing-3)', () => {
    expect(nudge).toMatch(/bottom: calc\(var\(--bottom-nav-height\) \+ var\(--safe-bottom\) \+ #\{\$spacing-3\}\)/);
    expect(toast).toMatch(/var\(--safe-bottom\) \+ #\{\$spacing-3\} \+ var\(--bottom-stack-offset/);
  });

  it('bildirim sağdaki yüzen düğme sütununa (16 + 56 px) girmez', () => {
    const right = Number(/right: (\d+)px;/.exec(toast.slice(toast.indexOf('@include below-desktop')))?.[1]);
    expect(right).toBeGreaterThanOrEqual(16 + 56);
  });
});
