import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import MatchCompetitionStandings from './index';

const row = (rank: number): CompetitionTableStandingRow => ({
  rank,
  points: 40 - rank,
  matches: 8,
  goal_diff: 10 - rank,
  won: 5,
  drawn: 1,
  lost: 2,
  team: { id: 1000 + rank, name: `Takım Adı Uzun ${rank}`, short_code: `T${rank}` },
});
/** Süper Lig (600) — düşme / Avrupa bölge renkleri bu id'ye göre. */
const table = (n: number): CompetitionTableData => ({ competition: { id: 600, name: 'Süper Lig' }, table: Array.from({ length: n }, (_, i) => row(i + 1)) });

const render = (props: Partial<Parameters<typeof MatchCompetitionStandings>[0]>) =>
  renderToStaticMarkup(<MatchCompetitionStandings data={table(36)} hideHeader {...props} />);
const tbody = (html: string) => html.slice(html.indexOf('<tbody>'), html.indexOf('</tbody>'));

describe('<MatchCompetitionStandings contained /> (ana sayfa yan paneli)', () => {
  it('contained: blok sınırlı ebeveyne sığar (blockContained), tablo bölgesi kaydırma kabı; verilmezse aynı', () => {
    expect(render({ contained: true })).toMatch(/<section class="[^"]*block[^"]* [^"]*blockContained[^"]*"/);
    expect(render({})).not.toContain('blockContained');
    expect(render({ contained: true })).toMatch(/class="[^"]*tableArea[^"]*"><div class="[^"]*scroll/);
  });

  it('satırlar (bölge renkleri, takım adı / kısaltma, logo, P) contained ile birebir aynı — yalnız kap değişir', () => {
    const a = tbody(render({ contained: true }));
    const b = tbody(render({}));
    expect(a).toBe(b);
    expect(a.match(/<tr/g)).toHaveLength(36);
    expect(a).toMatch(/class="[^"]*colRank[^"]* [^"]*rank[A-Z]/); // bölge şeridi sınıfı (ilk sıralar / düşme)
  });

  it('yükleniyor görünümü de contained (beklenen satır sayısıyla aynı yapı, tablo bölgesi içinde)', () => {
    const html = renderToStaticMarkup(<MatchCompetitionStandings data={null} loading loadingRows={36} hideHeader contained />);
    expect(html).toMatch(/<section class="[^"]*blockContained[^"]*" aria-busy="true"><div class="[^"]*tableArea/);
    expect(html.match(/<tr aria-hidden/g)).toHaveLength(36);
  });

  it('stil: tablo bölgesi kalan alanda iki eksende kayar, içteki .scroll kaydırma kabı değil, başlık satırı sticky', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/MatchCompetitionStandings/matchCompetitionStandings.module.scss'), 'utf8');
    const block = scss.slice(scss.indexOf('.blockContained {'));
    expect(block).toMatch(/^\.blockContained \{\s*display: flex;\s*flex-direction: column;\s*min-height: 0;/);
    expect(block).toMatch(/> \.tableArea \{\s*flex: 1 1 auto;\s*min-height: 0;\s*overflow: auto;/);
    expect(block).toMatch(/\.tableArea \.scroll \{\s*overflow: visible;/);
    expect(block).toMatch(/\.table thead th \{\s*position: sticky;\s*top: 0;\s*z-index: 2;/);
    expect(block).toMatch(/\.table thead th\.colPoints \{\s*z-index: 3;/);
    expect(block).toMatch(/> \* \{\s*flex: 0 0 auto;/);
    expect(scss).toMatch(/\.block\.blockContained \{\s*flex-shrink: 1;/);
    // Sabit yükseklik yok: tavanı ebeveyn verir (ana sayfa `$hub-fill-height`), kısa tabloda doğal boy
    expect(block.slice(0, block.indexOf('\n}\n'))).not.toMatch(/(?<![-\w])height: \d|max-height: \d/);
  });
});
