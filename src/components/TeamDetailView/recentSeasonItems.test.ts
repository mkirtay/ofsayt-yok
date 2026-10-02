import { describe, expect, it } from 'vitest';
import type { TeamMatch } from '@/services/sportmonks/teamOverview';
import { buildRecentItems, initialRecentCount, visibleRecentItems, type RecentItem } from './recentSeasonItems';

const m = (id: number, season: string) => ({ id, season_id: season === '2026/2027' ? 28203 : 25682 }) as TeamMatch;
const seasonOf = (x: TeamMatch) => (x.season_id === 28203 ? '2026/2027' : '2025/2026');
const kinds = (items: RecentItem[]) => items.map((i) => (i.kind === 'divider' ? `|${i.season}` : String(i.match.id)));

// GS gibi: 7 güncel sezon maçı, ardından geçen sezon.
const list = [...Array.from({ length: 7 }, (_, i) => m(i + 1, '2026/2027')), ...Array.from({ length: 20 }, (_, i) => m(100 + i, '2025/2026'))];

describe('sezon ayracı', () => {
  it('sezon değiştiği yerde tek ayraç', () => {
    const items = buildRecentItems(list, seasonOf, '2026/2027');
    expect(kinds(items).slice(0, 9)).toEqual(['1', '2', '3', '4', '5', '6', '7', '|2025/2026', '100']);
    expect(items.filter((i) => i.kind === 'divider')).toHaveLength(1);
  });

  it('ilk maç güncel sezondan değilse en başta ayraç; sezon bilgisi yoksa hiç ayraç yok', () => {
    expect(kinds(buildRecentItems([m(100, '2025/2026')], seasonOf, '2026/2027'))).toEqual(['|2025/2026', '100']);
    expect(buildRecentItems(list).every((i) => i.kind === 'match')).toBe(true);
  });

  it('ilk sayfa 10 satır bütçesini aşmaz: ayraç düşerse 9 maç + ayraç (384 ≤ 400 px)', () => {
    const items = buildRecentItems(list, seasonOf, '2026/2027');
    expect(initialRecentCount(items, 10)).toBe(9);
    expect(initialRecentCount(buildRecentItems(list), 10)).toBe(10);
  });

  it('görünür liste: ardından maç gelmeyen ayraç gösterilmez; Daha fazla +10 maç', () => {
    const items = buildRecentItems(list, seasonOf, '2026/2027');
    expect(kinds(visibleRecentItems(items, 7))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const shown = visibleRecentItems(items, 9 + 10);
    expect(shown.filter((i) => i.kind === 'match')).toHaveLength(19);
    expect(kinds(shown)[7]).toBe('|2025/2026');
  });
});
