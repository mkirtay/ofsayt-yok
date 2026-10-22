import { describe, expect, it } from 'vitest';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import { buildSceneSquads, type RawFormation, type RawLineupRow, type RawParticipant } from '@/services/sportmonks/commentaryScene';
import { SCENE_H, SCENE_W, buildKickoffScene, cornerPoint, placeSquad, zonePoint } from './sceneLayout';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;

describe('placeSquad', () => {
  it('ilk 11 noktası: ev solda, deplasman sağda, kaleci kendi kalesine en yakın', () => {
    const home = placeSquad(squads, 'home');
    const away = placeSquad(squads, 'away');
    expect(home).toHaveLength(11);
    expect(away).toHaveLength(11);
    const homeKeeper = home.find((p) => p.goalkeeper)!;
    const awayKeeper = away.find((p) => p.goalkeeper)!;
    expect(homeKeeper.x).toBeLessThan(SCENE_W / 2);
    expect(awayKeeper.x).toBeGreaterThan(SCENE_W / 2);
    expect(homeKeeper.x).toBeLessThan(Math.min(...home.filter((p) => !p.goalkeeper).map((p) => p.x)));
    expect(Math.round(homeKeeper.y)).toBe(SCENE_H / 2);
  });

  it('tüm noktalar sahanın içinde kalır', () => {
    for (const p of [...placeSquad(squads, 'home'), ...placeSquad(squads, 'away')]) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(SCENE_W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(SCENE_H);
    }
  });

  it('kadro yoksa varsayılan 4-4-2: yine 11 nokta, dört sıra', () => {
    const dots = placeSquad(null, 'home');
    expect(dots).toHaveLength(11);
    expect(new Set(dots.map((d) => Math.round(d.x))).size).toBe(4);
  });
});

describe('zonePoint — bölge haritası', () => {
  it('ceza sahası dışı kaleye daha uzak, altı pas en yakın', () => {
    const six = zonePoint('six_yard', 'home');
    const box = zonePoint('box_centre', 'home');
    const out = zonePoint('outside_box_centre', 'home');
    expect(six.x).toBeGreaterThan(box.x);
    expect(box.x).toBeGreaterThan(out.x);
  });

  it('sol/sağ hücum edenin bakışına göre: iki taraf için ayna', () => {
    // Sağa hücum eden (ev) için sol = ekranda yukarı; sola hücum eden (deplasman) için sol = aşağı.
    expect(zonePoint('box_left', 'home').y).toBeLessThan(SCENE_H / 2);
    expect(zonePoint('box_left', 'away').y).toBeGreaterThan(SCENE_H / 2);
    expect(zonePoint('box_right', 'home').y).toBeGreaterThan(SCENE_H / 2);
  });

  it('bölge bilinmiyorsa ceza sahası ortası', () => {
    expect(zonePoint(null, 'home')).toEqual(zonePoint('box_centre', 'home'));
  });
});

describe('cornerPoint', () => {
  it('hücum edilen kalenin köşesinde; olay kimliğiyle belirlenimli', () => {
    const c = cornerPoint(null, 'home', 4);
    expect(c.x).toBeGreaterThan(SCENE_W - 10);
    expect(cornerPoint(null, 'home', 4)).toEqual(c);
    expect(cornerPoint(null, 'away', 4).x).toBeLessThan(10);
  });
});

describe('buildKickoffScene — maç öncesi bekleme sahnesi', () => {
  it('22 nokta, top orta noktada', () => {
    const layout = buildKickoffScene(null);
    expect(layout.dots).toHaveLength(22);
    expect(layout.ball).toEqual({ x: SCENE_W / 2, y: SCENE_H / 2 });
  });

  it('iki takım kendi yarısında (ev solda, deplasman sağda)', () => {
    const { dots } = buildKickoffScene(null);
    expect(dots.filter((d) => d.side === 'home').every((d) => d.x < SCENE_W / 2)).toBe(true);
    expect(dots.filter((d) => d.side === 'away').every((d) => d.x > SCENE_W / 2)).toBe(true);
  });

  it('kadro gelirse onu kullanır (maç öncesi gelmiyor, yine de desteklenir)', () => {
    const layout = buildKickoffScene(squads);
    expect(layout.dots.filter((d) => d.name)).toHaveLength(22);
  });
});
