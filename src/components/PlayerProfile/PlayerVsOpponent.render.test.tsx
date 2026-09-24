import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import sample from '@/services/sportmonks/__fixtures__/playerLineupsSample.json';
import { listOpponents, mapPlayerLineups, vsOpponent, type RawPlayerLineup } from '@/utils/playerVs';

const state = vi.hoisted(() => ({ query: {} as Record<string, string>, rows: [] as unknown[] }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: state.query, pathname: '/players/[id]', push: vi.fn() }) }));
vi.mock('@/hooks/usePlayerVs', async () => {
  const u = await import('@/utils/playerVs');
  return {
    usePlayerVsOpponents: () => ({ data: { playerId: 1, opponents: u.listOpponents(state.rows as never) }, isLoading: false, isError: false }),
    usePlayerVs: (_p: number, opp: number | null) => ({
      data: opp == null ? undefined : { playerId: 1, minMinutesForAverage: 15, ...u.vsOpponent(state.rows as never, opp) },
      isLoading: false,
      isError: false,
    }),
  };
});

import PlayerVsOpponent from './PlayerVsOpponent';

const rowsOf = (k: 'kerem' | 'icardi') => mapPlayerLineups((sample as unknown as Record<string, { lineups: RawPlayerLineup[] }>)[k].lineups);
const render = (query: Record<string, string>, rows: unknown[]) => {
  state.query = query;
  state.rows = rows;
  return renderToStaticMarkup(<PlayerVsOpponent playerId={1} />);
};

describe('<PlayerVsOpponent />', () => {
  it('seçim yokken: seçici + ipucu + kapsam notu', () => {
    const html = render({}, rowsOf('kerem'));
    expect(html).toContain('Rakip seç');
    expect(html).toContain('Bir rakip seçerek');
    expect(html).toContain('Milli maçlar dahil değil.');
    expect(listOpponents(rowsOf('kerem'))[0]).toMatchObject({ id: 34, matches: 2 }); // en çok karşılaşılan üstte
  });

  it('Kerem vs Galatasaray (?vs=34): 2 maç, özet, rozet renkleri, satır → maç detayı', () => {
    const html = render({ vs: '34' }, rowsOf('kerem'));
    expect(html).toContain('Galatasaray karşısında');
    expect((html.match(/data-testid="vs-row"/g) ?? []).length).toBe(2);
    expect(html).toMatch(/href="\/matches\/\d+"/);
    // ortalama (6.69 + 6.13) / 2 = 6.41 → "6.4" turuncu
    expect(html).toMatch(/data-tone="poor"[^>]*>6\.4</);
    expect(html).toContain('0-3'); // oyuncunun takımı açısından (FB 0 - GS 3)
    expect(html).not.toContain('kadroda, oynamadı');
  });

  it('Icardi vs Fenerbahçe: yedekte kalınan maç ayrı satır, 1\' reytingsiz "—", 8\' reyting yıldızlı ve ortalamada yok', () => {
    const html = render({ vs: '88' }, rowsOf('icardi'));
    expect((html.match(/data-testid="vs-row"/g) ?? []).length).toBe(2);
    expect(html).toContain('1 maçta kadroda, oynamadı');
    expect(html).toMatch(/data-tone="fair"[^>]*>6\.5</); // 6.54 satırda gösterilir
    expect(html).toContain('15 dakikadan az oynanan maçların ratingi ortalamaya katılmaz');
    expect(html).toMatch(/data-tone="none"[^>]*>—</); // ortalama yok (tek reytingli maç 8')
    expect(vsOpponent(rowsOf('icardi'), 88).summary.averageRating).toBeNull();
  });

  it('karşılaşmadığı rakip: boş durum', () => {
    const html = render({ vs: '999' }, rowsOf('kerem'));
    expect(html).toContain('Bu rakiple kapsamdaki maçlarda karşılaşmamış.');
  });
});
