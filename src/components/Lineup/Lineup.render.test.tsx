import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Lineup, { formatPlayerRating } from './index';
import { mapSportmonksLineups } from '@/services/sportmonksKatman2Mapper';
import type { SportmonksFixture, SportmonksLineupRow } from '@/services/sportmonks/types';
import fixture from '@/services/sportmonks/__fixtures__/lineupFormationSuperLig.json';
import predictedSample from '@/services/sportmonks/__fixtures__/predictedLineupsSuperLig.json';
import { mapSportmonksPredictedLineups, type SportmonksFixtureWithPredicted } from '@/services/sportmonks/predictedLineups';
import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';

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

  it('deplasman hattında sütunlar ÇEVRİLMEZ (formation_field iki takımda ortak ekran çerçevesi: ev 2:1 sağ bek, dep 2:1 sol bek)', () => {
    const html = renderToStaticMarkup(<Lineup lineups={data} />);
    const rows = html.split(/class="[^"]*formationRow[^"]*"/).slice(1);
    const titles = (chunk: string) => [...chunk.matchAll(/formationPlayer[^"]*" title="([^"]+)"/g)].map((m) => m[1].trim());
    const def = (teamId: number) =>
      f.lineups
        .filter((r) => r.team_id === teamId && r.formation_field?.startsWith('2:'))
        .sort((a, b) => Number(a.formation_field!.split(':')[1]) - Number(b.formation_field!.split(':')[1]))
        .map((r) => r.player_name.trim());
    const [homeId, awayId] = [f.lineups[0].team_id, f.lineups.find((r) => r.team_id !== f.lineups[0].team_id)!.team_id];
    expect(titles(rows[1])).toEqual(def(homeId)); // ev savunması: 2:1 → 2:4
    expect(titles(rows[rows.length - 2])).toEqual(def(awayId)); // deplasman savunması: aynı sıra
  });
});

describe('formatPlayerRating — reyting rozeti mantığı', () => {
  it('tek ondalık basamağa yuvarlar (7.68 → "7.7")', () => {
    expect(formatPlayerRating(7.68)).toBe('7.7');
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
    expect(html).toContain('>7.7<');
    expect((html.match(/<img [^>]*formationPhoto/g) ?? []).length).toBe(starters.length);
    // 7.68 → "good" bandı (yeşil): rozet skaladan boyanır
    expect(html).toMatch(/data-tone="good"[^>]*data-testid="player-rating"/);
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
    expect((html.match(/data-tone="fair"/g) ?? []).length).toBe(3); // 6.5 → sarı-yeşil
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
    // Sahanın altındaki bölüm bench oyuncu sayısı kadar satır içerir; ilk 11 ayrıca listelenmez.
    const bottom = html.slice(html.indexOf('data-testid="bench-bottom"'));
    expect((bottom.match(/<li>/g) ?? []).length).toBe(bench.length);
    expect((html.match(/<li>/g) ?? []).length).toBe(bench.length);
  });

  it('bench yoksa bölüm hiç çizilmez', () => {
    const noBench = mapSportmonksLineups({ id: 1, participants: f.participants, lineups: f.lineups });
    expect(renderToStaticMarkup(<Lineup lineups={noBench} />)).not.toContain('Yedekler');
  });
});

describe('<Lineup /> render — yedek tahmini kadro (predictedLineups)', () => {
  const data = mapSportmonksPredictedLineups(predictedSample as unknown as SportmonksFixtureWithPredicted);
  const pre = { id: 19746580, status: 'NOT STARTED', date: '2026-10-23', scheduled: '20:00' } as unknown as Match;

  it('"Muhtemel 11" + tahmini notu, saha 3-4-3 / 4-3-3, yedek bölümü yok', () => {
    const html = renderToStaticMarkup(<Lineup lineups={data} match={pre} />);
    expect(html).toContain('Muhtemel 11');
    expect(html).toContain('Tahmini — resmî kadro açıklanınca güncellenir');
    expect(html).toContain('3-4-3');
    expect(html).toContain('4-3-3');
    expect((html.match(/class="[^"]*formationPlayer/g) ?? []).length).toBe(22);
    expect(html).not.toContain('data-testid="bench-bottom"');
  });

  it('kadro hiç yoksa (tahmin de yok) bölüm değil "henüz açıklanmadı" metni', () => {
    const html = renderToStaticMarkup(<Lineup lineups={null} match={pre} />);
    expect(html).not.toContain('Muhtemel 11');
    expect(html).toContain('Kadrolar henüz açıklanmadı.');
    expect(html).toContain('yaklaşık 1 saat önce açıklanır');
  });
});

describe('<Lineup /> render — olay ikonları, kaptan, maç öncesi', () => {
  const f = fixture as unknown as { participants: SportmonksFixture['participants']; lineups: SportmonksLineupRow[] };
  const starters = f.lineups.filter((r) => r.type_id === 11);
  const [scorer, assister, booked, subOff] = starters;
  const benchRow = { ...starters[5], id: 9100, player_id: 9100, player_name: 'Yedek Oyuncu', type_id: 12, formation_field: null, jersey_number: 99 } as unknown as SportmonksLineupRow;
  const data = mapSportmonksLineups({
    id: 1,
    participants: f.participants,
    lineups: [
      ...f.lineups.map((r) =>
        r.player_id === scorer.player_id
          ? { ...r, details: [{ type_id: 118, data: { value: 8.4 } }, { type_id: 40, data: { value: true } }] }
          : r,
      ),
      benchRow,
    ],
  });
  const ev = (over: Partial<MatchEvent>): MatchEvent =>
    ({ id: Math.random(), player: { id: 0, name: '' }, time: 10, event: 'GOAL', sort: 1, info: null, is_home: true, is_away: false, ...over }) as MatchEvent;
  const events: MatchEvent[] = [
    ev({ player: { id: scorer.player_id, name: 'A' }, related_player: { id: assister.player_id, name: 'B' }, time: 12 }),
    ev({ event: 'PENALTY', player: { id: scorer.player_id, name: 'A' }, time: 55 }),
    ev({ event: 'YELLOW_CARD', player: { id: booked.player_id, name: 'C' }, time: 30 }),
    ev({ event: 'RED_CARD', player: { id: booked.player_id, name: 'C' }, time: 40, rescinded: true }),
    ev({ event: 'SUBSTITUTION', player: { id: 9100, name: 'Yedek Oyuncu' }, related_player: { id: subOff.player_id, name: 'D' }, time: 67 }),
  ];
  const post = { id: 1, status: 'FINISHED', date: '2026-10-23', scheduled: '20:00' } as unknown as Match;
  const html = renderToStaticMarkup(<Lineup lineups={data} events={events} match={post} />);
  const link = (id: number) => new RegExp(`<a [^>]*href="/players/${id}"[^>]*>.*?</a>`).exec(html)?.[0] ?? '';

  it('iki gol → top + "2"; asist yapanda asist ikonu; geri alınan kırmızı sayılmaz', () => {
    expect(link(scorer.player_id)).toMatch(/data-ev="goal".*?evCount[^>]*>2</);
    expect(link(assister.player_id)).toContain('data-ev="assist"');
    expect(link(booked.player_id)).toContain('data-ev="yellow"');
    expect(link(booked.player_id)).not.toContain('data-ev="red"');
  });

  it('değişiklik: çıkan ilk-11 oyuncusunda ↓67\', yedek listesinde girende ↑67\'', () => {
    expect(link(subOff.player_id)).toMatch(/data-ev="sub-out".*?67&#x27;/);
    expect(link(9100)).toMatch(/data-ev="sub-in".*?67&#x27;/);
  });

  it('kaptan rozeti ve erişilebilir etiket (ad, kaptan, reyting, gol)', () => {
    expect(link(scorer.player_id)).toContain('data-testid="player-captain"');
    expect(link(scorer.player_id)).toMatch(/aria-label="[^"]+, Kaptan, reyting 8.4, 2 gol"/);
    expect(link(subOff.player_id)).toMatch(/aria-label="[^"]*67\. dakikada oyundan çıktı"/);
  });

  it('maç öncesi (resmî kadro bile olsa) puan rozeti ve olay ikonu yok', () => {
    const pre = { id: 1, status: 'NOT STARTED', date: '2026-10-23', scheduled: '20:00' } as unknown as Match;
    const h = renderToStaticMarkup(<Lineup lineups={{ ...data!, confirmed: true }} events={events} match={pre} />);
    expect(h).not.toContain('player-rating');
    expect(h).not.toContain('player-events');
    expect(h).toContain('data-testid="player-captain"');
  });
});
