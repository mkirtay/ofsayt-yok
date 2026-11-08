import { describe, expect, it } from 'vitest';
import data from '@/services/sportmonks/__fixtures__/commentaryScenes5.json';
import { normalizeCommentary, type RawComment } from '@/services/sportmonks/matchCommentary';
import {
  buildSceneSquads,
  resolveSceneSides,
  type RawFormation,
  type RawLineupRow,
  type RawMetadata,
  type RawParticipant,
  type RawSceneEvent,
  type SceneSquads,
} from '@/services/sportmonks/commentaryScene';
import { buildPlan, frame, type ScenePlan } from './scenePlan';
import { activeMove, simulate, type World } from './sceneMotion';
import { buildSceneEvents, type SceneEvent } from './sceneEvents';
import { DOT, validateScene, type Violation } from './sceneRules';
import { lane } from './sceneLayout';

/**
 * Gerçek yanıtlar (2026-11-03, `fixtures/{id}?include=comments;lineups;participants;formations;events;metadata`):
 * Trabzonspor–Gaziantep 19746573, Liverpool–Arsenal 19722117, Samsunspor–Amed 19746574 (penaltı golü 73′, iki ikinci sarı),
 * Bournemouth–Sunderland 19722143 (kırmızı 17′), Fenerbahçe–Alanyaspor 19746585 (kurtarılan penaltı 17′).
 */
type RawMatch = {
  name: string;
  participants: RawParticipant[];
  formations: RawFormation[];
  lineups: RawLineupRow[];
  events: RawSceneEvent[];
  metadata: RawMetadata[];
  comments: RawComment[];
};
const MATCHES = data as unknown as Record<string, RawMatch>;

function load(id: string): { squads: SceneSquads; events: SceneEvent[] } {
  const m = MATCHES[id]!;
  const squads = buildSceneSquads(m.lineups, m.participants, m.formations, m.events, m.metadata)!;
  return { squads, events: buildSceneEvents(resolveSceneSides(normalizeCommentary(m.comments), squads)).events };
}

/** Planın denetim anındaki (şut, penaltı vuruşu, korner ortası, ofsayt pası) kare → kural ihlalleri (düzeltmesiz). */
function checkAt(p: ScenePlan, w: World, minute: number | null): Violation[] {
  const vis = p.agents.map((a, i) => ({ a, i })).filter(({ a, i }) => !a.referee && !a.sub && w.bodies[i]!.opacity > 0.5);
  const idx = (i: number | null | undefined) => (i == null ? null : vis.findIndex((v) => v.i === i));
  return validateScene(
    {
      bodies: vis.map(({ a, i }) => ({
        side: a.side!,
        goalkeeper: a.goalkeeper,
        pos: w.bodies[i]!.pos,
        contact: !!activeMove(p.moves, i, w.t)?.contact || i === w.presser || i === w.ball.owner,
      })),
      ball: w.ball.pos,
      attack: p.side,
      geo: lane(p.side, p.flip),
      phase: p.check?.phase ?? (p.inPlay ? 'open' : 'dead'),
      shooter: idx(p.check?.shooter),
      offsider: idx(p.check?.offsider),
      expected: p.expected,
      lateGame: (minute ?? 0) >= 88,
      // Hareket hâlinde ölçülen: gerçek üst üste binme (nokta çapı), duran yerleşimdeki 1,2 kat pay değil.
      minGap: DOT - 1,
    },
    { fix: false },
  ).violations;
}

/** Maçın tüm sahneleri kronolojik sırayla, her biri öncekinden devam ederek (sitedeki gibi). */
function sweep(id: string) {
  const { squads, events } = load(id);
  const out: { ev: SceneEvent; plan: ScenePlan; violations: Violation[] }[] = [];
  let prev: World | null = null;
  for (const ev of [...events].reverse()) {
    const plan = buildPlan(ev.item, squads, { seed: ev.id, disallowed: ev.disallowed });
    if (!plan) continue;
    const w = simulate(plan, plan.check?.t ?? plan.climaxMs, prev);
    out.push({ ev, plan, violations: checkAt(plan, w, ev.item.minute) });
    prev = simulate(plan, plan.durationMs + 500, prev);
  }
  return out;
}

const ALL = Object.keys(MATCHES).flatMap((id) => sweep(id).map((r) => ({ id, ...r })));

describe('gerçek maçlar — kural taraması', () => {
  it('5 maçın tüm sahneleri oynatılabilir', () => {
    expect(ALL.length).toBeGreaterThan(340);
  });

  it('kişi sayısı, kaleci, penaltı yerleşimi ve saha sınırı hiçbir sahnede bozulmaz', () => {
    const bad = ALL.flatMap((r) => r.violations.filter((v) => ['count', 'keeper', 'penalty', 'bounds', 'phase'].includes(v.rule)).map((v) => `${r.id} ${r.ev.item.minute}′ ${r.plan.type}: ${v.rule} ${v.detail}`));
    expect(bad).toEqual([]);
  });

  it('ofsayt ve vuran–top kuralı: en çok 2 sınır vakası (360 sahnede)', () => {
    const bad = ALL.flatMap((r) =>
      r.violations
        .filter((v) => v.rule === 'offside' || v.rule === 'shooter')
        .map((v) => `${r.id} ${r.ev.item.minute}′ ${r.plan.type}${r.ev.item.scene.fromCorner ? ' (korner)' : ''}: ${v.rule} ${v.detail}`),
    );
    expect(bad.length, bad.join('\n')).toBeLessThanOrEqual(2);
  });

  it('denetim anında üst üste binen (nokta çapından yakın) çift yok denecek kadar az', () => {
    const overlaps = ALL.flatMap((r) => r.violations.filter((v) => v.rule === 'overlap'));
    expect(overlaps.length).toBeLessThanOrEqual(ALL.length * 0.02);
  });
});

describe('gerçek maçlar — kadro ve yön', () => {
  it('kırmızı kart: Sunderland 17′ sonrası sahnelerde 10 kişi, öncesinde 11', () => {
    const rows = ALL.filter((r) => r.id === '19722143');
    const count = (r: (typeof rows)[number]) => r.plan.agents.filter((a) => a.side === 'away' && !a.sub).length;
    const before = rows.find((r) => (r.ev.item.minute ?? 0) < 17)!;
    const after = rows.filter((r) => (r.ev.item.minute ?? 0) > 17);
    expect(count(before)).toBe(11);
    expect(after.length).toBeGreaterThan(20);
    for (const r of after) {
      expect(count(r)).toBe(10);
      expect(r.plan.expected.away).toBe(10);
      expect(r.plan.agents.some((a) => a.name === 'Kevin Danso')).toBe(false);
    }
  });

  it('kırmızı kart sahnesinde oyuncu kenara yürüyüp sahadan çıkar', () => {
    const r = ALL.find((x) => x.id === '19722143' && x.plan.type === 'card_red')!;
    const i = r.plan.agents.findIndex((a) => a.name === 'Kevin Danso');
    expect(r.plan.agents[i]!.actor).toBe(true);
    expect(r.plan.fades).toContainEqual(expect.objectContaining({ i, to: 0 }));
  });

  it('oyuncu değişikliği: çıkan oyuncu sonraki sahnelerde yok, giren onun diziliş yerinde (aynı kimlik)', () => {
    // Trabzonspor 63′: Umut Nayir girer, Paul Onuachu çıkar.
    const rows = ALL.filter((r) => r.id === '19746573');
    const before = rows.find((r) => (r.ev.item.minute ?? 0) > 46 && (r.ev.item.minute ?? 0) < 63)!;
    const after = rows.find((r) => (r.ev.item.minute ?? 0) > 63 && (r.ev.item.minute ?? 0) < 73)!;
    const key = before.plan.agents.find((a) => a.name === 'Paul Onuachu')!.key;
    expect(after.plan.agents.some((a) => a.name === 'Paul Onuachu')).toBe(false);
    expect(after.plan.agents.find((a) => a.key === key)!.name).toBe('Umut Nayir');
    expect(after.plan.agents.find((a) => a.key === key)!.number).not.toBeNull();
  });

  it('devre: ev sahibi 1. yarıda sağa, 2. yarıda (45+ uzatma hariç) sola hücum eder', () => {
    const rows = ALL.filter((r) => r.id === '19746573' && /^shot|^goal/.test(r.plan.type));
    for (const r of rows) {
      const m = r.ev.item.minute ?? 0;
      expect(r.plan.flip, `${m}′`).toBe(m > 45);
      // Hücum edenin kalesi yönü: şut hedefi rakip kale tarafında.
      const target = r.plan.ball.find((s) => s.kind === 'flight' && s.style === 'shot');
      if (!target || target.kind !== 'flight') continue;
      const rightGoal = target.to.x > 252;
      expect(rightGoal, `${m}′ ${r.plan.side}`).toBe((r.plan.side === 'home') !== r.plan.flip);
    }
    // 45+2 Savić golü ilk yarı.
    expect(ALL.find((r) => r.id === '19746573' && r.ev.item.minute === 45 && r.plan.type === 'goal')!.plan.flip).toBe(false);
  });

  it('penaltı: Orban 73′ gol ve Greenwood 17′ kurtarılan penaltı noktadan; vuruş anında diğerleri kutu dışında', () => {
    const pens = ALL.filter((r) => r.plan.penalty);
    expect(pens.map((r) => `${r.id}:${r.ev.item.minute}:${r.plan.type}`).sort()).toEqual(['19746574:73:goal', '19746585:17:shot_saved']);
    for (const r of pens) {
      const A = frame(r.plan.side, r.plan.flip);
      expect(A.u(r.plan.start.ball!)).toBeCloseTo(1 - 62 / 504, 3);
      expect(r.plan.start.ballDead).toBe(true);
      expect(r.violations.filter((v) => v.rule === 'penalty')).toEqual([]);
    }
  });

  it('forma numaraları kadrodan (ilk 11 dolu)', () => {
    for (const r of ALL.slice(0, 5)) expect(r.plan.agents.filter((a) => a.side && a.number == null)).toEqual([]);
  });
});
