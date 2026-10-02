import { describe, expect, it } from 'vitest';
import tr from '../../../public/locales/tr/match.json';
import { standingsGroupHeading } from './groupHeading';

const t = (key: string, opts: Record<string, unknown> = {}) => {
  const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tr) as string;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k]));
};

describe('standingsGroupHeading', () => {
  it('MLS konferansları Türkçe', () => {
    expect(standingsGroupHeading('Western Conference', t)).toBe('Batı Konferansı');
    expect(standingsGroupHeading('Eastern Conference', t)).toBe('Doğu Konferansı');
  });
  it('"Group A" → "Grup A"; kısa kod → "Grup X"; uzun ad aynen', () => {
    expect(standingsGroupHeading('Group A', t)).toBe('Grup A');
    expect(standingsGroupHeading('B', t)).toBe('Grup B');
    expect(standingsGroupHeading('Championship Round', t)).toBe('Championship Round');
  });
});
