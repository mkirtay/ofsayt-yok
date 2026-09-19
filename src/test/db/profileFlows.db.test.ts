/* eslint-disable @typescript-eslint/no-explicit-any -- entegrasyon testinde yanıt gövdeleri gevşek şemalı */
/**
 * GERÇEK veritabanı entegrasyon testi (DB mock'suz): premium ANALYSIS_FREE yazımı, kredi geçmişi sıralama/format,
 * favori içe aktarma ve `image` mutlak-URL normalizasyonu. Yalnızca dış servisler (canlı skor bağlamı + AI üretimi) taklit
 * edilir; Prisma, kimlik doğrulama (Bearer JWT), route handler'ları ve rate limit GERÇEK.
 *
 * Çalıştırma: `npm run test:db`. Tüm veriler `itest-<runId>` önekli, test sonunda silinir (kullanıcılar → CreditTransaction cascade,
 * MatchAnalysis → PredictionRecord cascade).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';

const ENABLED = process.env.DB_INTEGRATION === '1';

// ── Yalnızca dış servisler taklit: canlı skor bağlamı ve AI üretimi ──────────────────────────────
const fakeCtx = vi.hoisted(() => ({ byMatch: new Map<string, unknown>() }));

vi.mock('@/server/buildMatchAnalysisContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/buildMatchAnalysisContext')>();
  return { ...actual, buildMatchAnalysisContext: async (matchId: string) => fakeCtx.byMatch.get(matchId) ?? null };
});

vi.mock('@/services/aiAnalysisService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/aiAnalysisService')>();
  return {
    ...actual,
    generateMatchAnalysis: async () => ({
      modelVersion: 'itest-model',
      tokensUsed: 0,
      analysis: {
        matchSummary: 'özet',
        tacticalAnalysis: 'taktik',
        heatmapAnalysis: 'ısı',
        riskFactors: [],
        analystComment: 'yorum',
        riskLevel: 'LOW',
        riskReasoning: 'neden',
        overallConfidence: 0.5,
        teamAnalyses: { home: { narrative: 'ev' }, away: { narrative: 'dep' } },
        matchPrediction: { home: 50, draw: 25, away: 25 },
        scorePrediction: { home: 1, away: 0 },
        goalExpectation: { over25: 50, btts: 50 },
        bettingTips: [],
      },
    }),
  };
});

const d = ENABLED ? describe : describe.skip;

// ── Minimal req/res (route handler'ları doğrudan çağrılır) ───────────────────────────────────────
function makeReq(opts: { method: string; query?: Record<string, string>; body?: unknown; token: string }): NextApiRequest {
  return {
    method: opts.method,
    query: opts.query ?? {},
    body: opts.body,
    headers: { authorization: `Bearer ${opts.token}`, host: 'localhost:3000', 'x-forwarded-for': '203.0.113.7' },
    socket: { remoteAddress: '203.0.113.7' },
  } as unknown as NextApiRequest;
}
type Captured = { status: number; body: any; headers: Record<string, string> };
async function call(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, req: NextApiRequest): Promise<Captured> {
  const out: Captured = { status: 200, body: undefined, headers: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(b: unknown) {
      out.body = b;
      return this;
    },
    setHeader(k: string, v: string) {
      out.headers[k.toLowerCase()] = String(v);
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  await handler(req, res);
  return out;
}

d('DB entegrasyonu — premium analiz, kredi geçmişi, favoriler, avatar URL', () => {
  const runId = `itest-${randomUUID().slice(0, 8)}`;
  const matchPremium = `${runId}-mp`;
  const matchNormal = `${runId}-mn`;
  const teamBase = 900_000_000 + Math.floor(Math.random() * 90_000_000);

  let prisma: typeof import('@/lib/prisma').prisma;
  let PREMIUM_CREDIT_THRESHOLD: number;
  let premiumUser: { id: string; token: string };
  let normalUser: { id: string; token: string };
  let analysisHandler: (req: NextApiRequest, res: NextApiResponse) => unknown;
  let historyHandler: typeof analysisHandler;
  let myAnalysesHandler: typeof analysisHandler;
  let favoritesHandler: typeof analysisHandler;
  let meHandler: typeof analysisHandler;
  let mobileMeHandler: typeof analysisHandler;
  let premiumStart: number;

  const fakeContext = (matchId: string, homeId: number, awayId: number, home: string, away: string) => ({
    archived: false,
    matchPhase: 'PRE',
    match: { id: matchId, home: { id: homeId, name: home }, away: { id: awayId, name: away }, competition: { id: 1, name: 'ITest Lig' } },
    homeTeam: { teamId: homeId, teamName: home },
    awayTeam: { teamId: awayId, teamName: away },
  });

  beforeAll(async () => {
    ({ prisma } = await import('@/lib/prisma'));
    ({ PREMIUM_CREDIT_THRESHOLD } = await import('@/config/creditPackages'));
    const { issueMobileToken } = await import('@/lib/mobileAuth');
    analysisHandler = (await import('@/pages/api/matches/[id]/analysis')).default;
    historyHandler = (await import('@/pages/api/credits/history')).default;
    myAnalysesHandler = (await import('@/pages/api/credits/my-analyses')).default;
    favoritesHandler = (await import('@/pages/api/user/favorites')).default;
    meHandler = (await import('@/pages/api/user/me')).default;
    mobileMeHandler = (await import('@/pages/api/mobile/auth/me')).default;

    const mk = async (label: string, credits: number) => {
      const u = await prisma.user.create({
        data: { email: `${runId}-${label}@example.invalid`, name: `ITest ${label}`, credits, favoriteTeamIds: [34, 688] },
        select: { id: true },
      });
      return { id: u.id, token: await issueMobileToken({ sub: u.id, role: 'USER', credits }) };
    };
    premiumUser = await mk('premium', PREMIUM_CREDIT_THRESHOLD + 50);
    normalUser = await mk('normal', 5);

    // Geçmiş sıralaması için kontrollü zaman damgalı eski hareketler (premium kullanıcı).
    const now = Date.now();
    premiumStart = PREMIUM_CREDIT_THRESHOLD + 50;
    await prisma.creditTransaction.createMany({
      data: [
        { userId: premiumUser.id, type: 'SIGNUP_BONUS', amount: 5, balanceAfter: 5, note: 'Kayıt hoşgeldin bonusu', createdAt: new Date(now - 3 * 3_600_000) },
        { userId: premiumUser.id, type: 'ADMIN_GRANT', amount: 145, balanceAfter: premiumStart, note: 'itest grant', createdAt: new Date(now - 2 * 3_600_000) },
      ],
    });

    fakeCtx.byMatch.set(matchPremium, fakeContext(matchPremium, teamBase + 1, teamBase + 2, 'ITest Ev A', 'ITest Dep A'));
    fakeCtx.byMatch.set(matchNormal, fakeContext(matchNormal, teamBase + 3, teamBase + 4, 'ITest Ev B', 'ITest Dep B'));
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.matchAnalysis.deleteMany({ where: { matchId: { in: [matchPremium, matchNormal] } } }); // PredictionRecord cascade
    await prisma.user.deleteMany({ where: { email: { startsWith: runId } } }); // CreditTransaction cascade
    const left = await prisma.user.count({ where: { email: { startsWith: runId } } });
    const leftTx = await prisma.creditTransaction.count({ where: { matchId: { in: [matchPremium, matchNormal] } } });
    await prisma.$disconnect();
    expect({ left, leftTx }).toEqual({ left: 0, leftTx: 0 }); // temizlik doğrulaması
  });

  it('(a) premium kullanıcı analiz üretir: kredi düşmez, ANALYSIS_FREE (0) kaydı yazılır', async () => {
    const r = await call(analysisHandler, makeReq({ method: 'POST', query: { id: matchPremium }, token: premiumUser.token }));
    expect(r.status).toBe(200);
    expect(r.body.cached).toBe(false);

    const tx = await prisma.creditTransaction.findMany({ where: { userId: premiumUser.id, matchId: matchPremium } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'ANALYSIS_FREE', amount: 0, balanceAfter: premiumStart });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: premiumUser.id } })).credits).toBe(premiumStart);

    // Önbellekten gelen ikinci istek yeni kayıt YAZMAZ
    const again = await call(analysisHandler, makeReq({ method: 'POST', query: { id: matchPremium }, token: premiumUser.token }));
    expect(again.body.cached).toBe(true);
    expect(await prisma.creditTransaction.count({ where: { userId: premiumUser.id, matchId: matchPremium } })).toBe(1);
  });

  it('(a2) kontrol: premium olmayan kullanıcıdan 5 kredi düşer (ANALYSIS_SPEND −5)', async () => {
    const r = await call(analysisHandler, makeReq({ method: 'POST', query: { id: matchNormal }, token: normalUser.token }));
    expect(r.status).toBe(200);
    const tx = await prisma.creditTransaction.findMany({ where: { userId: normalUser.id, matchId: matchNormal } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ type: 'ANALYSIS_SPEND', amount: -5, balanceAfter: 0 });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: normalUser.id } })).credits).toBe(0);
  });

  it('(a3) my-analyses premium (ANALYSIS_FREE) analizini de listeler', async () => {
    const r = await call(myAnalysesHandler, makeReq({ method: 'GET', token: premiumUser.token }));
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { matchId: string }) => i.matchId)).toContain(matchPremium);
    const item = r.body.items.find((i: { matchId: string }) => i.matchId === matchPremium);
    expect(item).toMatchObject({ homeTeamName: 'ITest Ev A', awayTeamName: 'ITest Dep A' });
  });

  it('(b) credit-history: en yeniden eskiye, cursor ile sayfalanır, alanlar/format doğru', async () => {
    const p1 = await call(historyHandler, makeReq({ method: 'GET', query: { limit: '2' }, token: premiumUser.token }));
    expect(p1.status).toBe(200);
    expect(p1.body.items.map((i: { type: string }) => i.type)).toEqual(['ANALYSIS_FREE', 'ADMIN_GRANT']);
    expect(p1.body.nextCursor).toBe(p1.body.items[1].id);

    const free = p1.body.items[0];
    expect(free).toMatchObject({ amount: 0, balanceAfter: premiumStart, matchId: matchPremium, matchLabel: 'ITest Ev A - ITest Dep A' });
    expect(Number.isNaN(Date.parse(free.createdAt))).toBe(false);
    expect(new Date(free.createdAt).toISOString()).toBe(free.createdAt);
    expect(p1.body.items[1]).toMatchObject({ amount: 145, note: 'itest grant', matchId: null, matchLabel: null });

    const p2 = await call(historyHandler, makeReq({ method: 'GET', query: { limit: '2', cursor: p1.body.nextCursor }, token: premiumUser.token }));
    expect(p2.body.items.map((i: { type: string }) => i.type)).toEqual(['SIGNUP_BONUS']);
    expect(p2.body.nextCursor).toBeNull();

    // Başka kullanıcının hareketleri sızmaz
    const other = await call(historyHandler, makeReq({ method: 'GET', token: normalUser.token }));
    expect(other.body.items.every((i: { matchId: string | null }) => i.matchId !== matchPremium)).toBe(true);
  });

  it('(c) favori içe aktarma: birleşim gerçek DB satırını günceller; 50 üst sınırı 400 + satır değişmez', async () => {
    const { mergeFavoriteIds, parseLocalFavoriteIds } = await import('@/utils/favoriteImport');
    const cur = await call(favoritesHandler, makeReq({ method: 'GET', token: premiumUser.token }));
    expect(cur.body.favoriteTeamIds).toEqual([34, 688]);

    const local = parseLocalFavoriteIds('[34, 88, 3563]'); // cihazdaki localStorage değeri
    const { merged, added } = mergeFavoriteIds(cur.body.favoriteTeamIds, local);
    expect(added).toEqual([88, 3563]);

    const patch = await call(favoritesHandler, makeReq({ method: 'PATCH', body: { favoriteTeamIds: merged }, token: premiumUser.token }));
    expect(patch.status).toBe(200);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: premiumUser.id }, select: { favoriteTeamIds: true, favoriteLeagueIds: true } });
    expect(row.favoriteTeamIds).toEqual([34, 688, 88, 3563]);
    expect(row.favoriteLeagueIds).toEqual([]);

    const tooMany = await call(favoritesHandler, makeReq({ method: 'PATCH', body: { favoriteTeamIds: Array.from({ length: 51 }, (_, i) => i + 1) }, token: premiumUser.token }));
    expect(tooMany.status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: premiumUser.id } })).favoriteTeamIds).toEqual([34, 688, 88, 3563]);

    // Kaldırma (profildeki "Kaldır"): satırdan tek id düşer
    const rm = await call(favoritesHandler, makeReq({ method: 'PATCH', body: { favoriteTeamIds: [34, 88, 3563] }, token: premiumUser.token }));
    expect(rm.body.favoriteTeamIds).toEqual([34, 88, 3563]);
  });

  it('(d) image: DB göreli kalır, tüm API çıkışları (me/PATCH/mobile me) mutlak URL döner; geri yazımda göreli forma döner', async () => {
    const BASE = 'https://itest.ofsaytyok.example';
    const set = await call(meHandler, makeReq({ method: 'PATCH', body: { image: '/avatars/ball.svg' }, token: premiumUser.token }));
    expect(set.status).toBe(200);
    expect(set.body.image).toBe(`${BASE}/avatars/ball.svg`);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: premiumUser.id } })).image).toBe('/avatars/ball.svg'); // depolama DEĞİŞMEZ

    const get = await call(meHandler, makeReq({ method: 'GET', token: premiumUser.token }));
    expect(get.body.image).toBe(`${BASE}/avatars/ball.svg`);
    const mobile = await call(mobileMeHandler, makeReq({ method: 'GET', token: premiumUser.token }));
    expect(mobile.body.image).toBe(`${BASE}/avatars/ball.svg`);

    // Çıktıdaki mutlak URL aynen geri yazılırsa (web formu) depolama göreli forma döner
    await call(meHandler, makeReq({ method: 'PATCH', body: { image: get.body.image }, token: premiumUser.token }));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: premiumUser.id } })).image).toBe('/avatars/ball.svg');

    // Harici URL aynen; galeri dışı göreli yol reddedilir; temizleme null
    const ext = await call(meHandler, makeReq({ method: 'PATCH', body: { image: 'https://cdn.example.com/a.png' }, token: premiumUser.token }));
    expect(ext.body.image).toBe('https://cdn.example.com/a.png');
    const bad = await call(meHandler, makeReq({ method: 'PATCH', body: { image: '/avatars/../etc.svg' }, token: premiumUser.token }));
    expect(bad.status).toBe(400);
    const clear = await call(meHandler, makeReq({ method: 'PATCH', body: { image: '' }, token: premiumUser.token }));
    expect(clear.body.image).toBeNull();
  });
});
