import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import MatchList from '@/components/MatchList';
import { DEFAULT_LEAGUE_FILTER } from '@/utils/leagueFilter';
import { groupMatchesByLeague } from '@/services/liveScoreService';
import { buildNightGroups, type NightGroupsInput } from './nightSection';

const SELECTED = '2026-10-02';

function m(id: number, leagueId: number, date: string, scheduled: string, extra: Partial<Match> = {}): Match {
  return {
    id,
    status: 'NOT STARTED',
    time: '',
    date,
    scheduled,
    home: { id: id * 10, name: `Ev ${id}`, logo: '' },
    away: { id: id * 10 + 1, name: `Dep ${id}`, logo: '' },
    scores: { score: '', ht_score: '', ft_score: '' },
    competition: { id: leagueId, name: `Lig ${leagueId}`, logo: '' },
    country: { id: 1, name: 'Ülke', flag: '' },
    ...extra,
  } as Match;
}

// Gerçek örnek (2 Ekim): Independiente 22:15 UTC (01:15 TR), São Paulo 23:00 UTC (02:00 TR), Boca 3 Ekim 00:30 UTC (03:30 TR).
const independiente = m(19636616, 636, '2026-10-02', '22:15');
const saoPaulo = m(19621877, 648, '2026-10-02', '23:00');
const boca = m(19636615, 636, '2026-10-03', '00:30');

const base: NightGroupsInput = {
  selectedDate: SELECTED,
  nightMatches: [independiente, saoPaulo, boca],
  liveMatches: [],
  activeTab: 'all',
  favoriteTeamIds: new Set(),
  shownIds: new Set(),
  competitionFilter: null,
  leagueFilter: DEFAULT_LEAGUE_FILTER,
};

const ids = (groups: ReturnType<typeof buildNightGroups>) => groups.flatMap((g) => g.matches.map((x) => Number(x.id)));

describe('buildNightGroups (Gece maçları bölümü)', () => {
  it('"Tümü": lig gruplu, bütün gece maçları', () => {
    const groups = buildNightGroups(base);
    expect(groups.map((g) => g.competition_id).sort()).toEqual([636, 648]);
    expect(ids(groups).sort()).toEqual([19621877, 19636615, 19636616]);
  });

  it('canlı güncelleme: ertesi günün canlı satırı gece maçının üstüne yazılır; "Canlı" sekmesi yalnız canlıları alır', () => {
    const live = { ...saoPaulo, status: 'IN PLAY', time: "12'", scores: { score: '1 - 0', ht_score: '', ft_score: '' } } as Match;
    const all = buildNightGroups({ ...base, liveMatches: [live] });
    const row = all.flatMap((g) => g.matches).find((x) => Number(x.id) === saoPaulo.id)!;
    expect(row.status).toBe('IN PLAY');
    expect(row.scores?.score).toBe('1 - 0');

    // "Canlı" sekmesinde ana liste bütün canlıları zaten çizer → burada tekrar yok.
    expect(ids(buildNightGroups({ ...base, activeTab: 'live', liveMatches: [live] }))).toEqual([19621877]);
    expect(ids(buildNightGroups({ ...base, activeTab: 'live', liveMatches: [live], shownIds: new Set([19621877]) }))).toEqual([]);
  });

  it('"Bitmiş" ve "Favoriler" sekmeleri', () => {
    const finished = { ...independiente, status: 'FINISHED' } as Match;
    expect(ids(buildNightGroups({ ...base, nightMatches: [finished, saoPaulo], activeTab: 'finished' }))).toEqual([19636616]);
    expect(ids(buildNightGroups({ ...base, activeTab: 'favorites', favoriteTeamIds: new Set([boca.away.id]) }))).toEqual([19636615]);
  });

  it('lig çipleri: özel seçim (Liglerim) ve sayfa lig kısıtı uygulanır', () => {
    const custom = { mode: 'custom' as const, custom: [{ id: 648, name: 'Brezilya Serie A' }] };
    expect(ids(buildNightGroups({ ...base, leagueFilter: custom }))).toEqual([19621877]);
    expect(ids(buildNightGroups({ ...base, competitionFilter: new Set([636]) })).sort()).toEqual([19636615, 19636616]);
  });

  it('gece penceresi dışındaki maçlar (ertesi gün 06:00 ve sonrası, başka gün canlıları) girmez', () => {
    const morning = m(7, 567, '2026-10-03', '03:00'); // 06:00 TR
    const afternoonLive = m(8, 567, '2026-10-03', '14:00', { status: 'IN PLAY' });
    expect(ids(buildNightGroups({ ...base, nightMatches: [morning, saoPaulo], liveMatches: [afternoonLive] }))).toEqual([19621877]);
    expect(buildNightGroups({ ...base, nightMatches: [] })).toEqual([]);
  });
});

describe('<MatchList trailingSection> (gece maçları başlığı)', () => {
  const render = (props: Parameters<typeof MatchList>[0]) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MatchList {...props} />
      </QueryClientProvider>,
    );
  // Ana liste (2 Ekim): MLS 01:30 UTC ve La Liga 2 — yalnız lig grupları.
  const day = groupMatchesByLeague([m(1, 779, '2026-10-02', '01:30'), m(2, 567, '2026-10-02', '18:30')]);

  it('ana listenin altında gün başlığı (etiket + maç sayısı), altında kendi lig grupları', () => {
    const html = render({
      groupedMatches: day,
      trailingSection: { date: '2026-10-03', label: 'Gece maçları · 3 Ekim', groupedMatches: buildNightGroups(base) },
    });
    expect(html).toContain('data-fixture-date="2026-10-03"');
    expect(html).toContain('Gece maçları · 3 Ekim');
    expect(html).toContain('3 maç');
    // Bölüm başlığı ana listenin lig gruplarından SONRA
    expect(html.indexOf('data-competition-id="779"')).toBeLessThan(html.indexOf('data-fixture-date="2026-10-03"'));
    expect(html.indexOf('data-fixture-date="2026-10-03"')).toBeLessThan(html.indexOf('data-competition-id="648"'));
    // TR saatleri
    expect(html).toContain('02:00');
    expect(html).toContain('03:30');
  });

  it('bölüm boşsa başlık çizilmez; ana liste boş ama gece maçı varsa yalnız bölüm çizilir', () => {
    const noSection = render({ groupedMatches: day, trailingSection: { date: '2026-10-03', label: 'X', groupedMatches: [] } });
    expect(noSection).not.toContain('data-fixture-date');
    const onlyNight = render({ groupedMatches: [], trailingSection: { date: '2026-10-03', label: 'Gece maçları · 3 Ekim', groupedMatches: buildNightGroups(base) } });
    expect(onlyNight).toContain('Gece maçları · 3 Ekim');
    expect(onlyNight).not.toContain('Bu tarihte maç bulunamadı');
  });
});

describe('grup içi başlama sırası UTC gün sınırını geçer', () => {
  it('2 Ekim 22:15 UTC (01:15 TR) 3 Ekim 00:30 UTC\'den (03:30 TR) önce', () => {
    const groups = buildNightGroups(base);
    const argentina = groups.find((g) => g.competition_id === 636)!;
    expect(argentina.matches.map((x) => Number(x.id))).toEqual([19636616, 19636615]);
  });
});
