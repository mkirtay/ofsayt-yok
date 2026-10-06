import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardsList, ScorersList, StandingsTable } from './index';
import type { CompetitionTableStandingRow } from '@/services/liveScoreService';

const row = (rank: number, id: number, name: string, form?: Array<'W' | 'D' | 'L'>): CompetitionTableStandingRow => ({
  rank,
  points: 30 - rank,
  matches: 10,
  won: 5,
  drawn: 3,
  lost: 2,
  goals_scored: 15,
  goals_conceded: 9,
  goal_diff: 6,
  team: { id, name },
  team_id: id,
  name,
  ...(form ? { form } : {}),
});

vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('<StandingsTable />', () => {
  const rows = Array.from({ length: 18 }, (_, i) => row(i + 1, 100 + i, `Takım ${i + 1}`, i === 0 ? ['W', 'D', 'L', 'W', 'W'] : undefined));
  // 6 = Süper Lig (legacy); Sportmonks kapalıyken kural kimliği olduğu gibi kullanılır
  const html = renderToStaticMarkup(<StandingsTable blocks={[{ key: 'all', rows }]} competitionId={6} />);

  it('satır takım sayfasına bağlanır; sıra hücresi bölge bandı alır; açıklama yalnız görülen bölgeleri listeler', () => {
    expect(html).toContain('href="/teams/100"');
    expect(html).toContain('data-zone="ucl"');
    expect(html).toContain('data-zone="relegation"');
    expect(html).toMatch(/<ul[^>]*aria-label="[^"]+"/);
  });

  it('son 5 maç: erişilebilir ad + 5 nokta; form yoksa nokta yok', () => {
    expect((html.match(/role="img" aria-label="[^"]+(, [^"]+){4}"/g) ?? []).length).toBe(1); // yalnız form olan satır
    expect((html.match(/<i class="[^"]*dot/g) ?? []).length).toBe(10); // masaüstü sütunu + mobil satır içi (aria-hidden)
  });

  it('başlık satırı sabit sütun kapsamı (scope=col) taşır', () => {
    expect(html).toContain('<th class="');
    expect(html).toMatch(/<th[^>]*scope="col"/);
  });
});

describe('<ScorersList /> / <CardsList />', () => {
  it('ilk 3 satır madalya sınıfı alır; fotoğrafı olmayan oyuncuda avatar harfleri çıkar', () => {
    const html = renderToStaticMarkup(
      <ScorersList
        rows={[
          { goals: 7, assists: 2, played: 6, player: { id: 1, name: 'Gift Orban' }, team: { id: 9, name: 'Amed SK' } },
          { goals: 6, player: { id: 2, name: 'Victor Osimhen' }, team: { id: 8, name: 'Galatasaray' } },
          { goals: 5, player: { id: 3, name: 'A B' }, team: { id: 7, name: 'X' } },
          { goals: 4, player: { id: 4, name: 'C D' }, team: { id: 6, name: 'Y' } },
        ]}
      />,
    );
    expect((html.match(/<tr class="[^"]*(gold|silver|bronze)/g) ?? []).length).toBe(3);
    expect(html).toContain('GO'); // Gift Orban → baş harfler
    expect(html).toContain('—'); // oynanan / asist bilinmiyor → "0" değil
  });

  it('kartlar: sarı + kırmızı sütunu', () => {
    const html = renderToStaticMarkup(
      <CardsList rows={[{ player: { id: 1, name: 'Oyuncu' }, team: { id: 2, name: 'Takım' }, yellow_cards: 3, red_cards: 1 }]} />,
    );
    expect(html).toContain('>3<');
    expect(html).toContain('>1<');
  });
});
