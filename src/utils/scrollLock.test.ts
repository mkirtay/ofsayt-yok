import { describe, expect, it } from 'vitest';
import { lockBodyScroll } from './scrollLock';

const makeDoc = (bodyOverflow = '', htmlOverflow = '') => ({
  body: { style: { overflow: bodyOverflow } as Record<string, string> },
  documentElement: { style: { overflow: htmlOverflow } as Record<string, string> },
});

describe('lockBodyScroll', () => {
  it('kilitler: body ve html overflow:hidden', () => {
    const doc = makeDoc();
    lockBodyScroll(doc);
    expect(doc.body.style.overflow).toBe('hidden');
    expect(doc.documentElement.style.overflow).toBe('hidden');
  });
  it('açınca önceki değerler birebir geri gelir', () => {
    const doc = makeDoc('auto', 'scroll');
    const unlock = lockBodyScroll(doc);
    unlock();
    expect(doc.body.style.overflow).toBe('auto');
    expect(doc.documentElement.style.overflow).toBe('scroll');
  });
  it('boş başlangıç değeri boş olarak geri yazılır', () => {
    const doc = makeDoc();
    lockBodyScroll(doc)();
    expect(doc.body.style.overflow).toBe('');
  });
  it('çift unlock güvenli (ikinci çağrı sonradan değişen değeri ezmez)', () => {
    const doc = makeDoc();
    const unlock = lockBodyScroll(doc);
    unlock();
    doc.body.style.overflow = 'clip';
    unlock();
    expect(doc.body.style.overflow).toBe('clip');
  });
});
