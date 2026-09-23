import { describe, expect, it } from 'vitest';
import { isOutside } from './outsideClick';

/** Basit ağaç: her düğüm kendi alt düğümlerini "içerir". */
function node(...children: object[]) {
  const set = new Set<unknown>(children);
  const self = {
    contains: (o: unknown): boolean =>
      o === self || set.has(o) || children.some((c) => (c as { contains?: (x: unknown) => boolean }).contains?.(o) ?? false),
  };
  return self;
}

describe('isOutside', () => {
  const monthArrow = node();
  const dayCell = node();
  const panel = node(monthArrow, dayCell);
  const trigger = node();
  const elsewhere = node();

  it('panel içindeki tıklamalar (ay oku, gün) dışarı sayılmaz', () => {
    expect(isOutside(monthArrow, [panel, trigger])).toBe(false);
    expect(isOutside(dayCell, [panel, trigger])).toBe(false);
  });

  it('tetikleyiciye basmak dışarı sayılmaz (kapat-yeniden aç yarışı olmasın)', () => {
    expect(isOutside(trigger, [panel, trigger])).toBe(false);
  });

  it('sayfanın başka yeri dışarıdır; hedef yoksa kapatılmaz', () => {
    expect(isOutside(elsewhere, [panel, trigger])).toBe(true);
    expect(isOutside(null, [panel, trigger])).toBe(false);
    expect(isOutside(elsewhere, [null, undefined])).toBe(true);
  });
});
