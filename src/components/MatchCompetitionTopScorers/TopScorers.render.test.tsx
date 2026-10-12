import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, o?: { count?: number }) =>
      ({
        'topScorers.showAll': `Tümünü Göster (${o?.count})`,
        'topScorers.title': 'Gol Krallığı',
        'topScorers.player': 'Oyuncu',
        'topScorers.played': 'O',
        'topScorers.assists': 'A',
        'topScorers.goals': 'G',
        'topScorers.ariaLabel': 'Gol krallığı',
      })[k] ?? k,
  }),
}));

import MatchCompetitionTopScorers, { TOP_SCORERS_INITIAL_LIMIT, visibleScorers } from './index';

const mk = (n: number) => ({
  competition: { id: 6 },
  season: { id: 1, name: '2026/2027' },
  topscorers: Array.from({ length: n }, (_, i) => ({
    goals: 100 - i,
    played: 5,
    assists: 1,
    player: { id: i + 1, name: `Oyuncu ${i + 1}` },
    team: { id: 1, name: 'Takım' },
  })),
});

const rowCount = (html: string) => (html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr/g) ?? []).length;

describe('<MatchCompetitionTopScorers /> — ilk 20 + "Tümünü Göster"', () => {
  it('81 oyuncu varken yalnızca ilk 20 satır ve toplam sayılı "Tümünü Göster" düğmesi', () => {
    const html = renderToStaticMarkup(<MatchCompetitionTopScorers data={mk(81) as never} />);
    expect(TOP_SCORERS_INITIAL_LIMIT).toBe(20);
    expect(rowCount(html)).toBe(20);
    expect(html).toContain('Oyuncu 20<');
    expect(html).not.toContain('Oyuncu 21<');
    expect(html).toContain('Tümünü Göster (81)');
  });

  it('20 veya daha az oyuncuda düğme hiç görünmez', () => {
    for (const n of [5, 20]) {
      const html = renderToStaticMarkup(<MatchCompetitionTopScorers data={mk(n) as never} />);
      expect(rowCount(html)).toBe(n);
      expect(html).not.toContain('Tümünü Göster');
    }
  });

  it('G (gol) sütunu Puan Durumu\'yla aynı sticky mixin\'ini kullanır (yeni mekanizma yok)', () => {
    const read = (rel: string) => readFileSync(path.resolve(__dirname, '../../..', rel), 'utf8');
    const scorers = read('src/components/MatchCompetitionTopScorers/matchCompetitionTopScorers.module.scss');
    const standings = read('src/components/MatchCompetitionStandings/matchCompetitionStandings.module.scss');
    expect(scorers).toMatch(/\.colGoals\s*\{[^}]*@include sticky-last-column;/);
    expect(standings).toMatch(/\.colPoints\s*\{[^}]*@include sticky-last-column;/);
    expect(read('src/styles/_variables.scss')).toMatch(/@mixin sticky-last-column\s*\{[^}]*position: sticky;[^}]*right: 0;/);
  });

  it('visibleScorers: açılınca (yeni API isteği olmadan) tüm liste, kapalıyken ilk 20', () => {
    const all = Array.from({ length: 81 }, (_, i) => i);
    expect(visibleScorers(all, false)).toHaveLength(20);
    expect(visibleScorers(all, true)).toHaveLength(81);
    expect(visibleScorers(all.slice(0, 7), false)).toHaveLength(7);
  });
});

import { mergeAppearances } from '@/hooks/useTopScorerAppearances';

describe('mergeAppearances — O doluysa asist listesinde olmayan oyuncuda A = 0', () => {
  const payload = {
    topscorers: [
      { goals: 5, assists: 2, player: { id: 1 } }, // asist listesinde
      { goals: 4, player: { id: 2 } }, // asist listesinde yok, oynadığı doğrulanmış
      { goals: 3, player: { id: 3 } }, // asist listesinde yok, O bilinmiyor
    ],
  };
  const out = mergeAppearances(payload as never, { 1: 6, 2: 5 }).topscorers!;

  it('asisti olan oyuncu: gerçek değer korunur', () => {
    expect(out[0]).toMatchObject({ played: 6, assists: 2 });
  });
  it('O dolu + asist listesinde yok → assists 0', () => {
    expect(out[1]).toMatchObject({ played: 5, assists: 0 });
  });
  it('O boş → hem O hem A undefined ("—")', () => {
    expect(out[2].played).toBeUndefined();
    expect(out[2].assists).toBeUndefined();
  });
  it('tabloda 0 "0", undefined "—" olarak basılır', () => {
    const html = renderToStaticMarkup(
      <MatchCompetitionTopScorers data={{ competition: { id: 6 }, season: { id: 1 }, topscorers: out.map((s) => ({ ...s, team: { id: 1 } })) } as never} />,
    );
    const rows = [...html.matchAll(/<tr>.*?<\/tr>/g)]
      .map((m) => [...m[0].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, '')))
      .filter((r) => r.length > 0); // başlık satırında <td> yok
    expect(rows[1].slice(-3)).toEqual(['5', '0', '4']); // O, A, G
    expect(rows[2].slice(-3)).toEqual(['—', '—', '3']);
  });
});

describe('<MatchCompetitionTopScorers contained /> (ana sayfa yan paneli)', () => {
  it('contained: blok sınırlı ebeveyne sığar, satırlar ve "Tümünü Göster" aynı; verilmezse sınıf yok', () => {
    const a = renderToStaticMarkup(<MatchCompetitionTopScorers data={mk(81) as never} hideHeader contained />);
    const b = renderToStaticMarkup(<MatchCompetitionTopScorers data={mk(81) as never} hideHeader />);
    expect(a).toMatch(/<section class="[^"]*block[^"]* [^"]*blockContained/);
    expect(b).not.toContain('blockContained');
    expect(a.slice(a.indexOf('<tbody>'))).toBe(b.slice(b.indexOf('<tbody>')));
    expect(rowCount(a)).toBe(20);
    // "Tümünü Göster" tablonun (kaydırma kabının) dışında, altta
    expect(a.indexOf('Tümünü Göster')).toBeGreaterThan(a.indexOf('</table>'));
  });

  it('stil: liste (.scroll) kalan alanda iki eksende kayar, başlık sticky, diğer çocuklar sabit; yan panelde yalnız bu blok küçülür', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/MatchCompetitionTopScorers/matchCompetitionTopScorers.module.scss'), 'utf8');
    const block = scss.slice(scss.indexOf('.blockContained {'));
    expect(block).toMatch(/> \* \{\s*flex: 0 0 auto;/);
    expect(block).toMatch(/> \.scroll \{\s*flex: 1 1 auto;\s*min-height: 0;\s*overflow: auto;/);
    expect(block).toMatch(/\.table thead th \{\s*position: sticky;\s*top: 0;/);
    expect(scss).toMatch(/\.block\.blockContained \{\s*flex-shrink: 1;/);
    const page = readFileSync(path.join(process.cwd(), 'src/pages/index.module.scss'), 'utf8');
    expect(page).toMatch(/\.sidebarContent \{[^}]*overflow-y: auto;[^]*?> \* \{\s*flex-shrink: 0;/);
  });
});
