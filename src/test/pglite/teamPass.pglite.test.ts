/**
 * "Takımım" sezon paketi (büyüme raporu 2.8) — GERÇEK SQL (PGlite) + Prisma: krediyle al (tek işlem, defter), ikinci kez
 * yok, yetersiz kredi, bu sezon kapsama, paketle açılış kaydı (TEAM_PASS, ücretsiz), bayrak kapalıyken kapsama yok.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startPgliteServer, type PgliteServer } from './pgliteServer';

let server: PgliteServer;
let prisma: typeof import('@/lib/prisma').prisma;
let tp: typeof import('@/lib/teamPass');

beforeAll(async () => {
  server = await startPgliteServer();
  process.env.DATABASE_URL = server.url;
  delete process.env.DIRECT_URL;
  expect(new URL(process.env.DATABASE_URL).hostname).toBe('127.0.0.1');
  ({ prisma } = await import('@/lib/prisma'));
  tp = await import('@/lib/teamPass');
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.close();
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_TEAM_PASS_ENABLED;
  delete process.env.TEAM_PASS_COST;
});

describe('Takımım sezon paketi (PGlite + Prisma)', () => {
  it('sezon etiketi TSİ 1 Temmuz', () => {
    expect(tp.passSeason(Date.parse('2026-11-22T10:00:00Z'))).toBe('2026-27');
    expect(tp.passSeason(Date.parse('2027-06-30T20:00:00Z'))).toBe('2026-27');
    expect(tp.passSeason(Date.parse('2027-06-30T21:30:00Z'))).toBe('2027-28'); // 1 Temmuz 00:30 TSİ
  });

  it('al → kapsama → paketle açılış; ikinci kez ve yetersiz kredi reddedilir', async () => {
    process.env.NEXT_PUBLIC_TEAM_PASS_ENABLED = 'true';
    const u = await prisma.user.create({ data: { email: 'tp@ornek.example', credits: 12 } });
    const poor = await prisma.user.create({ data: { email: 'tp2@ornek.example', credits: 3 } });
    const gs = { id: 34, name: 'Galatasaray' };

    expect(await tp.teamPassCovers(u.id, [34, 88])).toBe(false);
    expect(await tp.buyTeamPass(u.id, gs)).toMatchObject({ cost: 10, balanceAfter: 2 });
    await expect(tp.buyTeamPass(u.id, gs)).rejects.toBeInstanceOf(tp.TeamPassOwnedError);
    await expect(tp.buyTeamPass(poor.id, gs)).rejects.toMatchObject({ name: 'InsufficientCreditsError' });
    expect((await prisma.user.findUnique({ where: { id: poor.id } }))!.credits).toBe(3);

    const ledger = await prisma.creditTransaction.findMany({ where: { userId: u.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ type: 'TEAM_PASS', amount: -10, balanceAfter: 2, idempotencyKey: `team-pass:${tp.passSeason()}:34` });

    expect(await tp.teamPassCovers(u.id, ['88', '34'])).toBe(true);
    expect(await tp.teamPassCovers(u.id, [88])).toBe(false);
    expect(await tp.myTeamPasses(u.id)).toEqual([{ teamId: 34, teamName: 'Galatasaray', season: tp.passSeason() }]);

    const ma = await prisma.matchAnalysis.create({
      data: {
        matchId: '1', matchStatus: 'PRE', modelVersion: 'v8', homeTeamId: '34', awayTeamId: '88', homeTeamName: 'Galatasaray', awayTeamName: 'Fenerbahçe',
        homeTeamNarrative: '', awayTeamNarrative: '', matchPrediction: {}, scorePrediction: {}, goalExpectation: {}, bettingTips: [], teamAnalyses: {},
        riskLevel: 'low', riskReasoning: '', confidenceScore: 50,
      } as never,
    });
    await tp.recordTeamPassUnlock(u.id, ma);
    await tp.recordTeamPassUnlock(u.id, ma); // tekrar: değişmez
    const unlocks = await prisma.analysisUnlock.findMany({ where: { userId: u.id } });
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0]).toMatchObject({ source: 'TEAM_PASS', creditTransactionId: null });
    expect((await prisma.user.findUnique({ where: { id: u.id } }))!.credits).toBe(2);

    delete process.env.NEXT_PUBLIC_TEAM_PASS_ENABLED;
    expect(await tp.teamPassCovers(u.id, [34])).toBe(false); // bayrak kapalı → DB'ye gitmez
  });

  it('fiyat ortamdan', () => {
    process.env.TEAM_PASS_COST = '15';
    expect(tp.teamPassCost()).toBe(15);
    process.env.TEAM_PASS_COST = 'x';
    expect(tp.teamPassCost()).toBe(tp.DEFAULT_TEAM_PASS_COST);
  });
});
