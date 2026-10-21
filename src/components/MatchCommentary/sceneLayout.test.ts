import { describe, expect, it } from 'vitest';
import lineupSample from '@/services/sportmonks/__fixtures__/commentaryLineup19746587.json';
import { classifyScene, type CommentaryItem } from '@/services/sportmonks/matchCommentary';
import { buildSceneSquads, type RawFormation, type RawLineupRow, type RawParticipant } from '@/services/sportmonks/commentaryScene';
import { BENCH_Y, SCENE_H, SCENE_W, buildScene, drift, goalMouth, placeSquad, zonePoint } from './sceneLayout';

const lineup = lineupSample as { participants: RawParticipant[]; formations: RawFormation[]; lineups: RawLineupRow[] };
const squads = buildSceneSquads(lineup.lineups, lineup.participants, lineup.formations)!;

/** Anlatım satırı kabuğu: sahne metinden, taraf elle (sunucuda resolveSceneSides yapıyor). */
const item = (en: string, { id = 1, side = 'home' as const }: { id?: number; side?: 'home' | 'away' } = {}): CommentaryItem => {
  const scene = classifyScene(en, id)!;
  return { id, order: id, minute: 10, extraMinute: null, kind: 'shot', important: false, en, tr: null, scene: { ...scene, side } };
};

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

describe('buildScene — olay türüne göre sahne', () => {
  it('gol: top kale ağzına gider, parlama var', () => {
    const layout = buildScene(item('Goal! Yunus Akgün scores, making it 0-1.', { id: 2, side: 'away' }), squads)!;
    expect(layout.ball!.x2).toBe(goalMouth('away').x);
    expect(layout.goalFlash).not.toBeNull();
    expect(layout.durationMs).toBeGreaterThanOrEqual(3000);
    expect(layout.durationMs).toBeLessThanOrEqual(5000);
  });

  it('kurtarış: top kalecide durur, kurtarış halkası o noktada', () => {
    const layout = buildScene(item("Gabriel Davi Gomes Sara takes a left-footed shot, but it's saved.", { id: 3, side: 'away' }), squads)!;
    expect(layout.save).not.toBeNull();
    expect(layout.ball!.rebound).toBe(true);
    expect(layout.ball!.x2).toBe(layout.save!.x);
  });

  it('savunmaya takılan şut yolun üçte birinde kesilir', () => {
    const layout = buildScene(item('Victor James Osimhen takes a right-footed shot, but it is blocked.', { id: 4, side: 'away' }), squads)!;
    const { x1, x2 } = layout.ball!;
    expect(Math.abs(x2 - x1)).toBeLessThan(Math.abs(goalMouth('away').x - x1) * 0.5);
  });

  it('ıska kalenin dışına, direk kale direğine gider', () => {
    const miss = buildScene(item('Mauro Icardi takes a shot with his left foot, but misses.', { id: 5, side: 'away' }), squads)!;
    const post = buildScene(item('Mauro Icardi takes a shot that hits the post.', { id: 5, side: 'away' }), squads)!;
    expect(Math.abs(miss.ball!.y2 - SCENE_H / 2)).toBeGreaterThan(Math.abs(post.ball!.y2 - SCENE_H / 2));
    expect(post.ball!.rebound).toBe(true);
  });

  it('korner: top köşeden başlar, ceza sahasına yüksek gelir', () => {
    const layout = buildScene(item('Corner awarded.', { id: 6, side: 'home' }), squads)!;
    const { x1, y1, arc } = layout.ball!;
    expect(x1).toBeGreaterThan(SCENE_W - 10);
    expect(y1 < 10 || y1 > SCENE_H - 10).toBe(true);
    expect(arc).toBeGreaterThan(20);
  });

  it('kart: kartı gören oyuncunun yanında, kırmızı ayırt edilir', () => {
    const yellow = buildScene(item('Victor James Osimhen receives a yellow card.', { id: 7, side: 'away' }), squads)!;
    const red = buildScene(item('Red card shown to Victor James Osimhen.', { id: 8, side: 'away' }), squads)!;
    expect(yellow.card!.red).toBe(false);
    expect(red.card!.red).toBe(true);
    const actor = yellow.dots.find((d) => d.actor)!;
    expect(yellow.card!.x).toBe(actor.x);
    expect(yellow.ball).toBeNull();
  });

  it('değişiklik: yedek oyuncu kenarda yeni nokta, çıkan ilk 11\'deki noktası', () => {
    // Yunus Akgün bu maçta yedek (sahada noktası yok) → kenar hizasında açılır; Barış Alper ilk 11'de.
    const layout = buildScene(item('Yunus Akgün comes on for Barış Alper Yılmaz.', { id: 9, side: 'away' }), squads)!;
    const on = layout.dots.find((d) => d.comingOn)!;
    const off = layout.dots.find((d) => d.goingOff)!;
    expect(on.name).toBe('Yunus Akgün');
    expect(on.y).toBe(BENCH_Y);
    expect(off.name).toBe('Barış Alper Yılmaz');
    expect(off.y).toBeGreaterThan(BENCH_Y);
  });

  it('değişiklikte giren oyuncu zaten sahadaysa yeni nokta açılmaz (22 nokta kalır)', () => {
    const layout = buildScene(item('Barış Alper Yılmaz comes on for Mario Lemina.', { id: 9, side: 'away' }), squads)!;
    expect(layout.dots).toHaveLength(22);
  });

  it('sahnesi olmayan satır null', () => {
    const none: CommentaryItem = { id: 1, order: 1, minute: null, extraMinute: null, kind: 'update', important: false, en: 'Offside.', tr: null, scene: null };
    expect(buildScene(none, squads)).toBeNull();
  });

  it('kadro yoksa sahne yine kurulur (22 nokta, varsayılan diziliş)', () => {
    const layout = buildScene(item('Corner awarded.', { id: 10 }), null)!;
    expect(layout.dots).toHaveLength(22);
    expect(layout.dots.every((d) => !d.actor)).toBe(true);
  });

  it('aktör kadroda bulunamazsa sahne çizilir, vurgu olmaz', () => {
    const layout = buildScene(item("Lionel Messi takes a right-footed shot, but it's saved.", { id: 11 }), squads)!;
    expect(layout.dots.filter((d) => d.actor)).toEqual([]);
    expect(layout.ball).not.toBeNull();
  });
});

describe('drift — oyuncuların topa doğru kayması', () => {
  it('en çok 10 px ve topa doğru', () => {
    const layout = buildScene(item('Goal! Yunus Akgün scores, making it 0-1.', { id: 12, side: 'away' }), squads)!;
    for (const dot of layout.dots) {
      const { dx, dy } = drift(dot, layout.ball);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(10.1);
    }
  });

  it('top yoksa kayma yok', () => {
    const layout = buildScene(item('Victor James Osimhen receives a yellow card.', { id: 13, side: 'away' }), squads)!;
    expect(drift(layout.dots[0]!, layout.ball)).toEqual({ dx: 0, dy: 0 });
  });
});
