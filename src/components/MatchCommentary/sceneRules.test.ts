import { describe, expect, it } from 'vitest';
import { MIN_GAP, frameOf, offsideLine, validateScene, type RuleBody, type SceneCheck } from './sceneRules';

// Ev sahibi sağa hücum ediyor (geo "home"): u = x / 504, s = (y − 160) / 146.
const A = frameOf('home');
const at = (u: number, s: number) => A.P(u, s);
const home = (u: number, s: number, extra: Partial<RuleBody> = {}): RuleBody => ({ side: 'home', goalkeeper: false, pos: at(u, s), ...extra });
const away = (u: number, s: number, extra: Partial<RuleBody> = {}): RuleBody => ({ side: 'away', goalkeeper: false, pos: at(u, s), ...extra });

/** Savunan (deplasman) kaleci + 4'lü hat u=0,80'de. */
const defence = (): RuleBody[] => [away(0.985, 0, { goalkeeper: true }), away(0.8, -0.6), away(0.8, -0.2), away(0.8, 0.2), away(0.8, 0.6)];
const check = (bodies: RuleBody[], extra: Partial<SceneCheck> = {}): SceneCheck => ({ bodies, ball: at(0.65, 0), attack: 'home', geo: 'home', phase: 'open', ...extra });
const rules = (r: { violations: { rule: string }[] }) => r.violations.map((v) => v.rule);

describe('offsideLine', () => {
  it('savunan takımın ikinci son oyuncusu (kaleci dahil)', () => {
    expect(offsideLine(defence(), 'home', 'home')).toBeCloseTo(0.8);
  });
});

describe('validateScene — ofsayt', () => {
  it('olay ofsayt değilse çizginin önündeki hücumcu çizgiye çekilir', () => {
    const bodies = [...defence(), home(0.88, 0.1)];
    const r = validateScene(check(bodies));
    expect(rules(r)).toContain('offside');
    expect(A.u(r.positions[5]!)).toBeLessThanOrEqual(0.8);
    expect(r.remaining.filter((v) => v.rule === 'offside')).toHaveLength(0);
  });

  it('topun gerisindeki ya da kendi yarısındaki oyuncu ofsayt değil', () => {
    const r = validateScene(check([...defence(), home(0.86, 0.1), home(0.4, 0)], { ball: at(0.9, 0.1) }), { fix: false });
    expect(rules(r)).not.toContain('offside');
  });

  it('aynı hizada olmak ofsayt değil (≈1 m pay)', () => {
    expect(rules(validateScene(check([...defence(), home(0.805, 0.4)]), { fix: false }))).not.toContain('offside');
  });

  it('ofsayt olayında ofsayttaki oyuncu çizginin önünde olmalı; gerisindeyse öne alınır', () => {
    const bodies = [...defence(), home(0.75, 0.4)];
    const r = validateScene(check(bodies, { offsider: 5 }));
    expect(rules(r)).toContain('offside');
    expect(A.u(r.positions[5]!)).toBeGreaterThan(0.81);
    expect(r.remaining.filter((v) => v.rule === 'offside')).toHaveLength(0);
  });

  it('köşe vuruşunda ve penaltıda ofsayt kuralı işlemez', () => {
    expect(rules(validateScene(check([...defence(), home(0.95, 0.3)], { phase: 'corner' }), { fix: false }))).not.toContain('offside');
  });
});

describe('validateScene — kaleci', () => {
  it('savunan kaleci ceza sahası dışındaysa kutuya çekilir', () => {
    const bodies = [away(0.7, 0, { goalkeeper: true }), away(0.8, -0.4), away(0.8, 0.4)];
    const r = validateScene(check(bodies));
    expect(rules(r)).toContain('keeper');
    expect(A.u(r.positions[0]!)).toBeGreaterThan(1 - 85 / 504);
    expect(r.remaining.filter((v) => v.rule === 'keeper')).toHaveLength(0);
  });

  it('hücum edenin kalecisi orta sahayı geçmez; son dakikalarda geçebilir', () => {
    const bodies = [...defence(), home(0.62, 0, { goalkeeper: true })];
    expect(A.u(validateScene(check(bodies)).positions[5]!)).toBeLessThanOrEqual(0.5);
    expect(rules(validateScene(check(bodies, { lateGame: true }), { fix: false }))).not.toContain('keeper');
  });

  it('penaltıda savunan kaleci çizgide', () => {
    const r = validateScene(check([away(0.93, 0, { goalkeeper: true })], { phase: 'penalty' }));
    expect(rules(r)).toContain('keeper');
    expect(A.u(r.positions[0]!)).toBeGreaterThan(0.975);
  });
});

describe('validateScene — sayı, çakışma, saha', () => {
  it('kırmızı karttan sonra 10 kişi beklenir; 11 kişi ihlal (düzeltilemez, bildirilir)', () => {
    const eleven = Array.from({ length: 11 }, (_, k) => away(0.55 + (k % 4) * 0.08, -0.8 + Math.floor(k / 4) * 0.6));
    const r = validateScene(check(eleven, { expected: { away: 10 } }));
    expect(r.remaining.find((v) => v.rule === 'count')?.detail).toBe('away: 11/10');
    expect(rules(validateScene(check(eleven.slice(1), { expected: { away: 10 } }), { fix: false }))).not.toContain('count');
  });

  it('üst üste binen iki nokta en az nokta çapı × 1,2 aralanır; temas hâlindeki çift hariç', () => {
    const r = validateScene(check([home(0.4, 0), home(0.405, 0.02)]));
    expect(rules(r)).toContain('overlap');
    expect(Math.hypot(r.positions[0]!.x - r.positions[1]!.x, r.positions[0]!.y - r.positions[1]!.y)).toBeGreaterThanOrEqual(MIN_GAP - 0.5);
    expect(rules(validateScene(check([home(0.4, 0, { contact: true }), away(0.405, 0.02, { contact: true })]), { fix: false }))).not.toContain('overlap');
  });

  it('sabit (rol) oyuncu yerinde kalır, diğeri yol verir', () => {
    const r = validateScene(check([home(0.4, 0, { fixed: true }), home(0.405, 0.02)]));
    expect(r.positions[0]).toEqual(at(0.4, 0));
  });

  it('saha dışındaki oyuncu içeri alınır (korner kullananı hariç)', () => {
    const r = validateScene(check([home(0.4, 1.2)]));
    expect(rules(r)).toContain('bounds');
    expect(r.positions[0]!.y).toBeLessThan(320 - 6);
    expect(rules(validateScene(check([home(1.0, 1.05, { fixed: true })], { phase: 'corner' }), { fix: false }))).not.toContain('bounds');
  });
});

describe('validateScene — şut ve penaltı', () => {
  it('şut anında vuran topun yanında; uzaksa topa alınır', () => {
    const bodies = [...defence(), home(0.7, 0.3)];
    const r = validateScene(check(bodies, { phase: 'shot', ball: at(0.84, 0), shooter: 5 }));
    expect(rules(r)).toContain('shooter');
    expect(r.remaining.filter((v) => v.rule === 'shooter')).toHaveLength(0);
  });

  it('şut anında savunanın en az 4 oyuncusu ceza sahası çevresinde; hücum edenin geridekileri kaleye yapışık değil', () => {
    const bodies = [away(0.985, 0, { goalkeeper: true }), away(0.55, -0.5), away(0.55, -0.1), away(0.55, 0.3), away(0.55, 0.7), home(0.12, 0)];
    const r = validateScene(check(bodies, { phase: 'shot', ball: at(0.85, 0) }));
    expect(rules(r)).toContain('phase');
    expect(r.remaining.filter((v) => v.rule === 'phase')).toHaveLength(0);
    expect(A.u(r.positions[5]!)).toBeGreaterThanOrEqual(0.28);
  });

  it('penaltı: atan ve kaleci dışında herkes ceza sahası ve yay dışında', () => {
    const spot = at(1 - 62 / 504, 0);
    const bodies = [away(0.99, 0, { goalkeeper: true }), home(A.u(spot) - 0.028, 0.03, { fixed: true }), home(0.88, 0.2), away(0.86, -0.3), away(0.78, 0), home(0.9, 0.5)];
    const r = validateScene(check(bodies, { phase: 'penalty', ball: spot, shooter: 1 }));
    expect(rules(r)).toContain('penalty');
    expect(r.remaining).toEqual([]);
    expect(r.positions[1]).toEqual(bodies[1]!.pos);
  });
});
