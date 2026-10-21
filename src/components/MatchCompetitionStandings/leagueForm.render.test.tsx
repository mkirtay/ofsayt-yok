import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import MatchCompetitionStandings from './index';

const row = (rank: number, form?: Array<'W' | 'D' | 'L'>): CompetitionTableStandingRow => ({
  rank,
  points: 40 - rank,
  matches: 8,
  goal_diff: 10 - rank,
  won: 5,
  drawn: 1,
  lost: 2,
  team: { id: 1000 + rank, name: `Takım ${rank}`, short_code: `T${rank}` },
  ...(form ? { form } : {}),
});
const data = (rows: CompetitionTableStandingRow[]): CompetitionTableData => ({ competition: { id: 600, name: 'Süper Lig' }, table: rows });
const render = (d: CompetitionTableData | null, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(<MatchCompetitionStandings data={d} hideHeader {...extra} />);

describe('<MatchCompetitionStandings /> lig formu sütunu', () => {
  it('form varsa P’nin solunda "Lig formu" sütunu; noktalar eskiden yeniye, etiket lig formu olduğunu söyler', () => {
    const html = render(data([row(1, ['W', 'D', 'L', 'W', 'W']), row(2, ['L', 'L', 'D', 'W', 'D'])]));
    const head = html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'));
    expect(head).toMatch(/Av<\/th><th class="[^"]*colForm[^"]*" title="Lig formu: son 5 lig maçı, en yenisi sağda">/);
    expect(head).toMatch(/colForm[^>]*>.*Lig formu.*<\/th><th class="[^"]*colPoints/);
    expect(html).toContain('aria-label="Lig formu, son 5 lig maçı: Galibiyet, Beraberlik, Mağlubiyet, Galibiyet, Galibiyet"');
    const firstRow = html.slice(html.indexOf('<tbody>'), html.indexOf('</tr>', html.indexOf('<tbody>')));
    const dots = [...firstRow.matchAll(/<i class="([^"]*)"/g)].map((m) => m[1]!.match(/dot[WDL]/)?.[0]);
    expect(dots).toEqual(['dotW', 'dotD', 'dotL', 'dotW', 'dotW']);
  });

  it('hiçbir satırda form yoksa sütun çizilmez (formsuz eski önbellek / istek); bir satırda yoksa hücresi boş', () => {
    expect(render(data([row(1), row(2)]))).not.toContain('colForm');
    const html = render(data([row(1, ['W']), row(2)]));
    expect(html.match(/<td class="[^"]*colForm/g)).toHaveLength(2);
  });

  it('yükleniyor görünümünde de form hücresi var (veri gelince sütun sayısı değişmez)', () => {
    const html = render(null, { loading: true, loadingRows: 3 });
    expect(html.match(/<td class="[^"]*colForm/g)).toHaveLength(3);
    expect(html).toMatch(/<th class="[^"]*colForm/);
  });

  it('stil: dar kapta (ana sayfa yan paneli < 280 px) sütun gizli, < 340 px görünen başlık "Form"', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/MatchCompetitionStandings/matchCompetitionStandings.module.scss'), 'utf8');
    expect(scss).toMatch(/@container \(max-width: 279\.98px\) \{\s*\.table th\.colForm,\s*\.table td\.colForm \{\s*display: none;/);
    expect(scss).toMatch(/@container \(max-width: 339\.98px\) \{\s*\.formHeadFull \{\s*position: absolute;/);
  });
});
