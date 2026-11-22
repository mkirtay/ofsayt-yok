import { describe, expect, it } from 'vitest';
import { shareGrid, shotEmoji } from './shareGrid';

const r = (kind: 'goal' | 'saved' | 'wall' | 'post' | 'miss', corner = false) => ({ kind, points: 0, viaPost: false, corner });

describe('Frikik emoji paylaşım satırı', () => {
  it('vuruş başına emoji; köşe golü ayrı', () => {
    expect([r('goal'), r('goal', true), r('saved'), r('wall'), r('post'), r('miss')].map(shotEmoji).join('')).toBe('⚽🎯🧤🧱🥅❌');
  });
  it('10\'arlı satır', () => {
    expect(shareGrid(Array.from({ length: 12 }, () => r('goal')))).toBe(`${'⚽'.repeat(10)}\n⚽⚽`);
  });
});
