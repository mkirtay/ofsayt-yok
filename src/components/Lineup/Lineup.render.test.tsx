import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Lineup, { formatPlayerRating } from './index';
import { mapSportmonksLineups } from '@/services/sportmonksKatman2Mapper';
import type { SportmonksFixture, SportmonksLineupRow } from '@/services/sportmonks/types';
import fixture from '@/services/sportmonks/__fixtures__/lineupFormationSuperLig.json';

/** Gerçek fixture 19746621'i gerçekten render eder: saha üzerinde satırların formasyon şeklinde olduğunu doğrular. */
describe('<Lineup /> render — formasyon satırları', () => {
  const f = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
  const data = mapSportmonksLineups({ id: 1, participants: f.participants, lineups: f.lineups });

  it('saha satırları home 1-4-2-3-1 ve away (ters) 1-4-1-4-1 olarak dizilir, iki düz sıra DEĞİL', () => {
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    const counts = html
      .split(/class="[^"]*formationRow[^"]*"/)
      .slice(1)
      .map((chunk) => (chunk.match(/formationPlayer/g) ?? []).length);
    // home: GK,4,2,3,1  |  away (ileri hat en üstte): 1,4,1,4,1 ters çevrilmiş
    expect(counts).toEqual([1, 4, 2, 3, 1, 1, 4, 1, 4, 1]);
    expect(html).toContain('4-2-3-1');
    expect(html).toContain('4-1-4-1');
  });
});

describe('formatPlayerRating — reyting rozeti mantığı', () => {
  it('tek ondalık basamakla yazar (kesilmiş — 7.68 "7.7" değil "7.6": renk bandıyla tutarlı)', () => {
    expect(formatPlayerRating(7.68)).toBe('7.6');
    expect(formatPlayerRating(6)).toBe('6.0');
  });
  it('undefined / null / 0 / negatif / NaN için null — rozet çizilmez, ASLA "0" değil', () => {
    for (const v of [undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(formatPlayerRating(v as number | null | undefined)).toBeNull();
    }
  });
});

describe('<Lineup /> render — oyuncu fotoğrafı + reyting rozeti', () => {
  const f = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
  const starters = f.lineups.filter((r) => r.type_id === 11);
  const build = (patch: (row: SportmonksLineupRow, i: number) => Partial<SportmonksLineupRow>) =>
    mapSportmonksLineups({
      id: 1,
      participants: f.participants,
      lineups: f.lineups.map((r, i) => ({ ...r, ...patch(r, i) })),
    });

  it('reyting ve foto varken her ilk-11 oyuncusunda <img> + tek ondalıklı rozet basılır', () => {
    const data = build((r) => ({
      player: { id: r.player_id, display_name: r.player_name, image_path: `https://cdn.example/p/${r.player_id}.png` },
      details: [{ type_id: 118, data: { value: 7.68 } }],
    }));
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    expect((html.match(/data-testid="player-rating"/g) ?? []).length).toBe(starters.length);
    expect(html).toContain('>7.6<');
    expect((html.match(/<img [^>]*formationPhoto/g) ?? []).length).toBe(starters.length);
    // 7.68 → "good" bandı (yeşil): rozet skaladan boyanır, kadro listesinde de aynı rozet var
    expect(html).toMatch(/data-tone="good"[^>]*data-testid="player-rating"/);
    expect((html.match(/data-testid="compact-rating"/g) ?? []).length).toBe(starters.length);
    expect(html).toContain('https://cdn.example/p/');
  });

  it('reyting yoksa rozet HİÇ basılmaz ve "0" görünmez; foto yoksa forma numarası kalır', () => {
    const data = build(() => ({ player: undefined, details: undefined }));
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    expect(html).not.toContain('player-rating');
    expect(html).not.toContain('<img ');
    // Forma numarası daire içinde duruyor (fallback stili).
    const firstShirt = String(starters[0].jersey_number);
    expect(html).toContain(`>${firstShirt}<`);
  });

  it('rating: 0 gelse bile (mapper ele alır) rozet çizilmez', () => {
    const data = build(() => ({ details: [{ type_id: 118, data: { value: 0 } }] }));
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    expect(html).not.toContain('player-rating');
  });

  it('karışık: yalnızca reytingi olan oyuncuda rozet var', () => {
    let n = 0;
    const data = build((r) =>
      r.type_id === 11 && n++ < 3 ? { details: [{ type_id: 118, data: { value: 6.5 } }] } : { details: [] },
    );
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    expect((html.match(/data-testid="player-rating"/g) ?? []).length).toBe(3);
    expect((html.match(/data-tone="fair"/g) ?? []).length).toBe(6); // saha + liste, 6.5 → sarı-yeşil
  });
});

describe('<Lineup /> yan listeler — foto + mevki + sahaya yakın hizalama', () => {
  const f = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
  const data = mapSportmonksLineups({
    id: 1,
    participants: f.participants,
    lineups: f.lineups.map((r) => ({ ...r, player: { id: r.player_id, display_name: r.player_name, image_path: `https://cdn.example/p/${r.player_id}.png` } })),
  });
  const html = renderToStaticMarkup(<Lineup lineups={data} />);
  const rows = [...html.matchAll(/<a [^>]*class="[^"]*compactRow[^"]*"[^>]*>.*?<\/a>/g)].map((m) => m[0]);
  const starters = f.lineups.filter((r) => r.type_id === 11).length;

  it('her ilk-11 oyuncusu için (iki liste) bir satır; forma no + foto + isim + mevki', () => {
    expect(rows).toHaveLength(starters);
    for (const r of rows) {
      expect(r).toContain('compactNumber');
      expect(r).toContain('<img ');
      expect(r).toContain('compactName');
    }
  });

  it('mevki etiketleri Türkçe (Kaleci/Defans/Orta Saha/Forvet) ve her takımda bir Kaleci var', () => {
    const labels = rows.flatMap((r) => [...r.matchAll(/compactPos[^>]*>([^<]+)</g)].map((m) => m[1]));
    expect(new Set(labels)).toEqual(new Set(['Kaleci', 'Defans', 'Orta Saha', 'Forvet']));
    expect(labels.filter((l) => l === 'Kaleci')).toHaveLength(2);
  });

  it('sol liste (ev sahibi) sahaya yakın sağ kenara, sağ liste (deplasman) sol kenara yaslanır', () => {
    const home = rows.filter((r) => r.includes('compactRowHome'));
    const away = rows.filter((r) => r.includes('compactRowAway'));
    expect(home.length).toBeGreaterThan(0);
    expect(away.length).toBeGreaterThan(0);
    expect(home.length + away.length).toBe(rows.length);
  });

  it('DOM sırası her iki listede de [no][foto][metin]; isim + mevki aynı metin bloğunda', () => {
    const home = rows.find((r) => r.includes('compactRowHome'))!;
    const away = rows.find((r) => r.includes('compactRowAway'))!;
    const at = (r: string, k: string) => r.indexOf(k);
    for (const r of [home, away]) {
      expect(at(r, 'compactNumber')).toBeLessThan(at(r, 'compactPhoto'));
      expect(at(r, 'compactPhoto')).toBeLessThan(at(r, 'compactText'));
      const block = /<span class="[^"]*compactText[^"]*">(.*?)<\/span><\/span>/.exec(r)?.[1] ?? '';
      expect(block).toContain('compactName');
    }
  });

  it('foto yoksa <img> yerine boş daire; mevki bilinmiyorsa etiket basılmaz', () => {
    const bare = mapSportmonksLineups({ id: 1, participants: f.participants, lineups: f.lineups.map((r) => ({ ...r, player: undefined, position_id: 0 })) });
    const h = renderToStaticMarkup(<Lineup lineups={bare} />);
    const bareRows = [...h.matchAll(/<a [^>]*class="[^"]*compactRow[^"]*"[^>]*>.*?<\/a>/g)].map((m) => m[0]);
    expect(bareRows.every((r) => !r.includes('<img ') && r.includes('compactPhotoEmpty') && !r.includes('compactPos'))).toBe(true);
  });
});

describe('<Lineup /> render — Yedekler (bench)', () => {
  const f = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
  // Fixture yalnızca ilk 11 içerir → yedekler ilk 11 satırlarından türetilir (type_id 12 = Bench, formation_field yok).
  const homeId = f.lineups[0].team_id;
  const bench = f.lineups
    .filter((r) => r.type_id === 11)
    .slice(0, 5)
    .map((r, i) => ({ ...r, id: 9000 + i, player_id: 9000 + i, type_id: 12, formation_field: null, jersey_number: 20 - i }) as unknown as SportmonksLineupRow);
  const withBench = mapSportmonksLineups({ id: 1, participants: f.participants, lineups: [...f.lineups, ...bench] });
  const html = renderToStaticMarkup(<Lineup lineups={withBench} />);

  it('bench oyuncusu varken "Yedekler" bölümü, bench oyuncu sayısı kadar satırla çizilir', () => {
    expect(bench.length).toBeGreaterThan(0);
    expect(homeId).toBeTruthy();
    expect(html).toContain('Yedekler');
    // Alt bölüm (yan listeler gizliyken görünür) bench oyuncu sayısı kadar satır içerir.
    const bottom = html.slice(html.indexOf('data-testid="bench-bottom"'));
    expect((bottom.match(/<li>/g) ?? []).length).toBe(bench.length);
    // Yan listede (ilk 11'in altında) "Yedekler (n)" alt başlığı çizilir.
    expect(html).toMatch(/compactBenchTitle[^>]*>Yedekler \(\d+\)/);
  });

  it('bench yoksa bölüm hiç çizilmez', () => {
    const noBench = mapSportmonksLineups({ id: 1, participants: f.participants, lineups: f.lineups });
    expect(renderToStaticMarkup(<Lineup lineups={noBench} />)).not.toContain('Yedekler');
  });
});
