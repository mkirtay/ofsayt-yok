import { describe, expect, it } from 'vitest';
import { createSentenceGate, isAllowedLinkHref, sanitizeLinks } from './outputFilter';

describe('asistan çıktı süzgeci', () => {
  it('cümle tamamlanınca bırakır; yarım cümle bekler; ondalık sayı bölünmez', () => {
    const g = createSentenceGate();
    expect(g.push('Galatasaray maç başı 2.')).toBe('');
    expect(g.push('5 gol attı. Sıradaki')).toBe('Galatasaray maç başı 2.5 gol attı.');
    expect(g.push(' maç cuma.')).toBe('');
    expect(g.flush()).toBe(' Sıradaki maç cuma.');
    expect(g.blocked()).toBe(false);
  });

  it('bahis terimi içeren cümle gönderilmez ve akış kesilir', () => {
    const g = createSentenceGate();
    expect(g.push('Form iyi. ')).toBe('Form iyi.');
    expect(g.push('Bu maç için kupon öneririm. Devamı')).toBe('');
    expect(g.blocked()).toBe(true);
    expect(g.push(' temiz cümle. ')).toBe('');
    expect(g.flush()).toBe('');
  });

  it('son (noktasız) parça da denetlenir', () => {
    const g = createSentenceGate();
    g.push('iddaa oynanır');
    expect(g.flush()).toBe('');
    expect(g.blocked()).toBe(true);
  });

  it('link beyaz listesi: yalnız site içi yol', () => {
    for (const ok of ['/', '/teams/34', '/matches/1-a-b?sekme=ai-analiz', '#kural-kosesi']) expect(isAllowedLinkHref(ok), ok).toBe(true);
    for (const bad of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', 'teams/34', '/a b', '#baska', '', null, 5]) {
      expect(isAllowedLinkHref(bad), String(bad)).toBe(false);
    }
    expect(sanitizeLinks([{ label: 'A', href: '/a' }, { label: 'A2', href: '/a' }, { label: 'X', href: 'https://x.y' }, { label: '', href: '/b' }, { label: 'C', href: '/c' }])).toEqual([
      { label: 'A', href: '/a' },
      { label: 'C', href: '/c' },
    ]);
  });
});
