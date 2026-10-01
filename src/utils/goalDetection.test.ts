import { describe, expect, it } from 'vitest';
import { detectGoals } from './goalDetection';

const scores = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('detectGoals', () => {
  it('ilk yüklemede (önceki skor yok) olay yok', () => {
    expect(detectGoals(new Map(), scores({ a: '1-0' })).size).toBe(0);
  });

  it('ev sahibi ya da deplasman golünü tarafıyla bulur', () => {
    const goals = detectGoals(scores({ a: '0-0', b: '1 - 1' }), scores({ a: '1-0', b: '1 - 2' }));
    expect(goals.get('a')).toEqual({ side: 'home', key: 'a:1-0' });
    expect(goals.get('b')).toEqual({ side: 'away', key: 'b:1-2' });
  });

  it('skor değişmediyse, azaldıysa (düzeltme) ya da okunamazsa olay yok', () => {
    const goals = detectGoals(scores({ a: '1-0', b: '2-0', c: '- : -' }), scores({ a: '1-0', b: '1-0', c: '1-0' }));
    expect(goals.size).toBe(0);
  });

  it('listeye yeni giren maç için olay yok', () => {
    expect(detectGoals(scores({ a: '0-0' }), scores({ a: '0-0', z: '3-1' })).size).toBe(0);
  });

  it('iki taraf birden arttıysa tek olay (ev sahibi)', () => {
    expect(detectGoals(scores({ a: '0-0' }), scores({ a: '1-1' })).get('a')?.side).toBe('home');
  });
});
