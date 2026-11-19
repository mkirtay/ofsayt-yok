import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import RefereeView from './RefereeView';
import CoachView from './CoachView';
import type { RefereePageData } from '@/server/people/refereePage';
import type { CoachPageData } from '@/server/people/coachPage';
import { findGamblingTerms } from '@/utils/gamblingTerms';

const recent = [{ id: 19746609, status: 'FINISHED', date: '2026-09-19', home: { id: 688, name: 'Trabzonspor' }, away: { id: 34, name: 'Galatasaray' }, scores: { score: '4 - 0', ht_score: '', ft_score: '' }, competition: { id: 600, name: 'Super Lig' } }];

const referee: RefereePageData = {
  id: 62331,
  name: 'Batuhan Kolak',
  country: { name: 'Turkey', iso2: 'TR' },
  seasons: [{ seasonId: 28203, seasonName: '2026/2027', leagueId: 600, startingAt: '2026-08-14', matches: 4, yellowPerMatch: 3.5, redPerMatch: 0.5, penaltiesPerMatch: 0.25, foulsPerMatch: 26, varPerMatch: null }],
  recent,
  summary: {
    totalMatches: 50,
    seasonCount: 3,
    context: {
      seasonId: 28203,
      seasonName: '2026/2027',
      leagueId: 600,
      matches: 4,
      rates: { yellow: 3.5, red: 0.5, penalties: 0.25, var: null },
      leagueAvg: { yellow: 3.9, red: 0.2, penalties: 0.3, var: 0.6 },
    },
  },
  teams: {
    defaultSeason: '2026/2027',
    seasons: [
      {
        seasonName: '2026/2027',
        matchCount: 4,
        rows: [
          { teamId: 34, name: 'Galatasaray', matches: 2, yellow: 4, red: 2, penaltiesFor: 0 },
          { teamId: 688, name: 'Trabzonspor', matches: 1, yellow: 4, red: 0, penaltiesFor: 0 },
        ],
      },
      { seasonName: '2025/2026', matchCount: 15, rows: [{ teamId: 88, name: 'Fenerbahçe', matches: 3, yellow: 9, red: 0, penaltiesFor: 1 }] },
    ],
  },
};

describe('<RefereeView />', () => {
  const html = renderToStaticMarkup(<RefereeView data={referee} />);
  it('"Başka bir hakemle karşılaştır" → /hakemler (lig + sezon, hakem seçili)', () => {
    expect(html).toContain('href="/hakemler/super-lig/2026-2027?a=batuhan-kolak-62331"');
  });

  it('başlık: baş harfli avatar, ad, ülke; foto / yaş yok', () => {
    expect(html).toContain('>BK<');
    expect(html).toContain('<h1');
    expect(html).toContain('Batuhan Kolak');
    expect(html).not.toMatch(/yaş/);
    expect(html).toContain('Türkiye');
    expect(html).not.toContain('Turkey');
  });
  it('sezon tablosu, son maçlar (maç sayfasına link), takım kırılımı başlığında sezon ve maç sayısı', () => {
    expect(html).toContain('Turnuvalara göre');
    expect(html).toContain('href="/matches/19746609-trabzonspor-galatasaray"');
    expect(html).toContain('Takım kırılımı — 2026/2027 sezonu (4 maç)');
    expect(html).toContain('3,5');
  });
  it('özet kartları: kapsanan maç + sezon sayısı; lig-sezon bağlamı ve her ortalamanın altında lig ortalaması', () => {
    expect(html).toContain('data-testid="referee-summary"');
    expect(html).toContain('Kapsanan maç');
    expect(html).toContain('>50<');
    expect(html).toContain('3 sezon');
    expect(html).toContain('Süper Lig 2026/2027, 4 maç');
    expect(html).toContain('Lig ort.: 3,9');
    expect(html.match(/Lig ort\.:/g)).toHaveLength(4);
  });

  it('takım kırılımı sezon seçicisi (varsayılan güncel sezon); turnuva tablosu tek sezonda düz satır', () => {
    expect(html).toContain('<option value="2026/2027" selected="">2026/2027 (4 maç)</option>');
    expect(html).toContain('<option value="2025/2026">2025/2026 (15 maç)</option>');
    expect(html).not.toContain('Fenerbahçe</a>'); // seçili olmayan sezonun satırı çizilmez
    expect(html).toContain('data-testid="referee-competitions"');
    expect(html).not.toContain('aria-expanded'); // tek sezonlu turnuva açılmaz
    expect(html).not.toContain('Tüm turnuvalar'); // tek turnuvada toplam satırı yok
  });

  it('takım satırları maç sayısı sırasında, her satırda maç sayısı; not var; vurgu / yorum / kumar dili yok', () => {
    expect(html.indexOf('Galatasaray</a>')).toBeLessThan(html.indexOf('Trabzonspor</a>'));
    expect(html).toContain('Küçük örneklemler yanıltıcı olabilir');
    expect(html).not.toMatch(/en çok|en az|highest|lowest/i);
    expect(findGamblingTerms(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});

describe('<RefereeView /> yabancı UEFA hakemi', () => {
  const uefaRow = (seasonName: string, leagueId: number, matches: number, yellow: number) => ({
    seasonId: matches, seasonName, leagueId, startingAt: null, matches, yellowPerMatch: yellow, redPerMatch: 0, penaltiesPerMatch: 0.5, foulsPerMatch: 24, varPerMatch: 0.2,
  });
  const foreign: RefereePageData = {
    ...referee,
    id: 14808,
    name: 'Chris Kavanagh',
    country: { name: 'England', iso2: 'GB' },
    photo: 'https://cdn.sportmonks.com/images/soccer/referees/9/14808.png',
    seasons: [uefaRow('2026/2027', 8, 7, 3), uefaRow('2026/2027', 2, 3, 4), uefaRow('2025/2026', 5, 5, 5)],
    upcoming: [{ id: 19873236, status: 'NOT STARTED', date: '2026-11-24', scheduled: '17:45', home: { id: 34, name: 'Galatasaray' }, away: { id: 15, name: 'Aston Villa' }, competition: { id: 2, name: 'Champions League' } }],
    trMatches: [{ id: 19873252, status: 'FINISHED', date: '2026-11-03', home: { id: 1, name: 'VfB Stuttgart' }, away: { id: 34, name: 'Galatasaray' }, scores: { score: '1 - 1', ht_score: '', ft_score: '' }, competition: { id: 2, name: 'Champions League' } }],
  };
  const html = renderToStaticMarkup(<RefereeView data={foreign} />);
  it('fotoğraf varsa görsel (baş harf yedeği), sıradaki görev TSİ saatiyle maç sayfasına link', () => {
    expect(html).toContain('14808.png');
    expect(html).not.toContain('>CK<');
    expect(html).toContain('data-testid="referee-next"');
    expect(html).toContain('href="/matches/19873236-galatasaray-aston-villa"');
    expect(html).toContain('24.11.2026 · 20:45');
  });
  it('Türk takımlarıyla maçları + UEFA kariyeri (yalnız UEFA satırları, maç ağırlıklı) + karşılaştırma linki en çok maçlı ligde', () => {
    expect(html).toContain('Türk takımlarıyla maçları');
    expect(html).toContain('href="/matches/19873252-vfb-stuttgart-galatasaray"');
    expect(html).toContain('data-testid="referee-uefa"');
    expect(html).toContain('8 maç · 2 sezon');
    expect(html).toContain('4,63');
    expect(html).toContain('href="/hakemler/premier-lig/2026-2027?a=chris-kavanagh-14808"');
  });
  it('yorum / vurgu / kumar dili yok', () => {
    expect(html).not.toMatch(/en sert|en çok|en az|en yumuşak/i);
    expect(findGamblingTerms(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});

describe('<CoachView />', () => {
  const coach: CoachPageData = {
    id: 199988,
    name: 'Okan Buruk',
    photo: 'https://cdn.sportmonks.com/images/soccer/coaches/20/199988.png',
    age: 52,
    nationality: { name: 'Turkey', iso2: 'TR' },
    currentTeam: { id: 34, name: 'Galatasaray', since: '2022-06-23' },
    seasons: [{ seasonId: 25682, seasonName: '2025/2026', leagueId: 600, teamId: 34, teamName: 'Galatasaray', matches: 34, wins: 24, draws: 5, losses: 5, winPct: 71 }],
    recent,
  };
  const html = renderToStaticMarkup(<CoachView data={coach} />);
  it('başlık: foto, yaş, uyruk, mevcut takım (takım sayfasına link) + göreve başlama', () => {
    expect(html).toContain('52 yaş');
    expect(html).toContain('href="/teams/34-galatasaray"');
    expect(html).toContain('Göreve başlama');
    expect(html).toContain('23.06.2022');
    expect(html).toContain('Türkiye');
  });

  it('mobilde tablolar kartı taşırmaz, kendi içinde kayar; ilk sütun sabit', async () => {
    const { readFileSync } = await import('node:fs');
    const scss = readFileSync(new URL('./personPage.module.scss', import.meta.url), 'utf8');
    expect(scss).toMatch(/\.page \{[^}]*grid-template-columns: minmax\(0, 1fr\);/);
    expect(scss).toMatch(/\.card \{\s*min-width: 0;/);
    expect(scss).toMatch(/\.scroll \{\s*overflow-x: auto;/);
    expect(scss).toMatch(/td:first-child \{\s*position: sticky;\s*left: 0;/);
  });
  it('son maçlarda takım logosu + \"Daha fazla\" düğmesi (yalnız daha eski maç varsa)', () => {
    const withLogos = { ...coach, hasMoreMatches: true, recent: [{ ...recent[0]!, home: { id: 688, name: 'Trabzonspor', logo: 'https://cdn.sportmonks.com/images/soccer/teams/16/688.png' } }] } as CoachPageData;
    const h = renderToStaticMarkup(<CoachView data={withLogos} />);
    expect(h).toContain('688.png');
    expect(h).toContain('Daha fazla maç göster');
    expect(html).not.toContain('Daha fazla maç göster');
  });
  it('özet kartları + sezon/takım grup başlığı (ara toplam)', () => {
    expect(html).toContain('data-testid="coach-summary"');
    expect(html).toContain('2025/2026');
    expect(html).toContain('34 maç');
  });
  it('sezon × turnuva × takım G-B-M ve galibiyet yüzdesi; kapsam notu', () => {
    expect(html).toContain('%71');
    expect(html).toContain('Kapsadığımız turnuvalar gösterilir.');
  });
});
