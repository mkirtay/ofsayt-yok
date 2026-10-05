import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchCard from '@/components/MatchCard';
import type { Head2HeadData } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';

const pre = {
  id: 1,
  status: 'NOT STARTED',
  time: '',
  date: '2026-10-18',
  scheduled: '17:00',
  location: 'RAMS Park',
  referee: 'A. Kaya',
  country: { id: 404, name: 'Turkey', iso2: 'TR' },
  competition: { id: 600, name: 'Super Lig' },
  home: { id: 34, name: 'Galatasaray' },
  away: { id: 1071, name: 'Kasımpaşa' },
  coaches: { home: 'O. Buruk', homeId: 199988, homeFull: 'Okan Buruk', away: 'E. Belözoğlu' },
  tv_stations: ['beIN Sports 1'],
} as unknown as Match;

const h2h = {
  team1: { id: '34', name: 'Galatasaray', overall_form: ['W', 'D'], h2h_form: ['W', 'L'] },
  team2: { id: '1071', name: 'Kasımpaşa', overall_form: ['L'], h2h_form: ['L', 'W'] },
  h2h: [
    { id: '10', date: '2026-05-17', home_name: 'Kasımpaşa', away_name: 'Galatasaray', score: '1-3', ht_score: '0-1', status: 'FINISHED' },
    { id: '11', date: '2025-12-21', home_name: 'Galatasaray', away_name: 'Kasımpaşa', score: '2-2', ht_score: '1-0', status: 'FINISHED' },
    { id: '12', date: '2025-03-02', home_name: 'Galatasaray', away_name: 'Kasımpaşa', score: '1-1', ps_score: '3-4', finish: 'PEN', status: 'FINISHED' },
    { id: '13', date: '2024-09-28', home_name: 'Kasımpaşa', away_name: 'Galatasaray', score: '1-2', finish: 'AET', status: 'FINISHED' },
  ],
} as unknown as Head2HeadData;

const render = (match: Match) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchCard match={match} initialH2h={h2h} />
    </QueryClientProvider>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('maç kartı üst bölümü (sadeleştirme)', () => {
  it('başlıkta "Tarih:" yok; ülke adı Türkçe', () => {
    const html = render(pre);
    expect(text(html)).not.toMatch(/Tarih\s*:/);
    expect(html).toContain('>Türkiye</strong>');
  });

  it('teknik direktörler takım adlarının altında (TD sayfasına link); bilgi kartında TD hücresi yok', () => {
    const html = render(pre);
    expect(html).toMatch(/Galatasaray<\/div>[^]*?<a [^>]*href="\/teknik-direktor\/okan-buruk-199988"[^>]*>O\. Buruk<\/a>/);
    expect(html).toMatch(/Kasımpaşa<\/div>[^]*?<span[^>]*>E\. Belözoğlu<\/span>/);
    expect(html).not.toContain('Teknik Direktörler');
  });

  it('Stadyum · Hakem · Nerede İzlenir tek satırda, saatin altında', () => {
    const html = render(pre);
    const kickoffAt = html.indexOf('kickoffTime');
    const lineAt = html.indexOf('data-info="stadium"');
    expect(kickoffAt).toBeGreaterThan(0);
    expect(lineAt).toBeGreaterThan(kickoffAt);
    expect([...html.matchAll(/data-info="([a-z]+)"/g)].map((m) => m[1])).toEqual(['stadium', 'referee', 'tv']);
  });

  it('bitmiş maçta tarih + saat skorun altında', () => {
    const html = render({ ...pre, status: 'FINISHED', time: '90', scores: { score: '2 - 1', ht_score: '1 - 0' } } as Match);
    expect(text(html)).toMatch(/18\.10\.2026 · 20:00/);
  });

  it('"Karşılıklı son 5" yok; takımların "Son 5 Maç" satırı var', () => {
    const html = render(pre);
    expect(html).not.toContain('Karşılıklı son 5');
    expect(html).toContain('Son 5 Maç');
  });

  it('karşılaşma geçmişi: Saat / Durum yok; kazanan kalın, beraberlik nötr; UZS / PEN etiketi', () => {
    const html = render(pre);
    expect(html).not.toMatch(/>Saat<|>Durum</);
    const rows = [...html.matchAll(/<tr class="[^"]*h2hTr[^"]*">([^]*?)<\/tr>/g)].map((m) => m[1]!);
    expect(rows).toHaveLength(4);
    const winnerCell = (row: string) => row.match(/<td class="[^"]*h2hWinner[^"]*">([^<]*)</)?.[1] ?? null;
    expect(winnerCell(rows[0]!)).toBe('Galatasaray'); // 1-3 deplasman
    expect(winnerCell(rows[1]!)).toBeNull(); // 2-2 beraberlik
    expect(winnerCell(rows[2]!)).toBe('Kasımpaşa'); // 1-1, penaltılar 3-4
    expect(rows[2]).toMatch(/h2hFinishTag[^>]*>PEN</);
    expect(rows[3]).toMatch(/h2hFinishTag[^>]*>UZS</);
    expect(rows[1]).not.toContain('h2hFinishTag');
    for (const row of rows) expect(row).not.toContain('formPill'); // tabloda G/B/M rozeti yok
  });
});
