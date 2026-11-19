import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RefereeCompetitionTable, { groupByCompetition } from './RefereeCompetitionTable';
import type { RefereeSeasonTableRow } from '@/services/sportmonks/refereeStats';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const row = (seasonId: number, seasonName: string, leagueId: number | null, matches: number, yellow: number, v: number | null = 0.2): RefereeSeasonTableRow => ({
  seasonId, seasonName, leagueId, startingAt: null, matches, yellowPerMatch: yellow, redPerMatch: 0.1, penaltiesPerMatch: 0.2, foulsPerMatch: 22, varPerMatch: v,
});

// Yeni sezon önce (refereeSeasonTable sırası).
const rows = [
  row(1, '2026/2027', 8, 8, 3),
  row(2, '2026/2027', 2, 5, 4),
  row(3, '2025/2026', 8, 30, 3.1),
  row(4, '2025/2026', 2, 10, 4.5),
  row(5, '2024/2025', 8, 26, 4.62, null),
  row(6, '2023/2024', 5, 1, 6),
];

describe('groupByCompetition', () => {
  const g = groupByCompetition(rows);
  it('turnuva başına tek satır, en çok maçlı turnuva önce', () => {
    expect(g.map((x) => [x.leagueId, x.matches, x.seasons.length])).toEqual([
      [8, 64, 3],
      [2, 15, 2],
      [5, 1, 1],
    ]);
  });
  it('maç ağırlıklı ortalama; değeri olmayan sezon VAR ortalamasından düşer', () => {
    expect(g[0].rates.yellow).toBeCloseTo((8 * 3 + 30 * 3.1 + 26 * 4.62) / 64, 2);
    expect(g[0].rates.var).toBe(0.2);
    expect(g[0].rates.fouls).toBe(22);
  });
  it('sezon aralığı: çok sezonda yıl aralığı, tek sezonda sezon adı', () => {
    expect(g[0].span).toBe('2024–2027');
    expect(g[2].span).toBe('2023/2024');
  });
});

describe('<RefereeCompetitionTable />', () => {
  const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n));
  const html = renderToStaticMarkup(<RefereeCompetitionTable rows={rows} fmt={fmt} />);
  it('kapalı başlar: turnuva satırları, açılır düğme, toplam satırı; sezon satırları çizilmez', () => {
    expect(html).toContain('Turnuvalara göre');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).toMatch(/3 sezon · <span[^>]*>2024–2027<\/span>/);
    expect(html).toContain('Tüm turnuvalar');
    expect(html).toContain('>80<');
    expect(html).not.toContain('>2025/2026<');
  });
  it('yorum / vurgu / kumar dili yok', () => {
    expect(html).not.toMatch(/en çok|en az|en sert/i);
    expect(findGamblingTerms(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});
