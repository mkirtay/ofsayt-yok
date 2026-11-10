import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

/** Kombine aracı: COMBO_TOOL_ENABLED kapısı, yönetici yetkisi, girdi doğrulama, yalnız seçilen maçlar için oran. */
const h = vi.hoisted(() => ({ admin: true }));
vi.mock('@/lib/requireAuth', () => ({
  requireAdmin: vi.fn(async (_req: unknown, res: { status: (c: number) => { json: (b: unknown) => void } }) => {
    if (h.admin) return { ok: true, userId: 'a' };
    res.status(401).json({ error: 'x' });
    return { ok: false };
  }),
}));
const cand = {
  matchId: '10', label: 'A – B', homeName: 'A', awayName: 'B', competition: 'L', kickoffIso: '2026-11-12T18:00:00.000Z', key: 'over15', pct: 85,
};
const loadCandidates = vi.hoisted(() => vi.fn());
const resolveOdds = vi.hoisted(() => vi.fn());
vi.mock('@/server/combo/candidates', () => ({ loadComboCandidates: loadCandidates, loadComboHistory: vi.fn(async () => ({ evaluatedMatches: 0, bands: [], sinceVersion: 5 })) }));
vi.mock('@/server/combo/afOdds', () => ({ resolveOdds }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import handler from '@/pages/api/admin/kombine';
import { getServerSideProps } from '@/pages/admin/kombine';

function mkRes() {
  return {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string>,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
  };
}
async function call(method: string, opts: { query?: Record<string, string>; body?: unknown } = {}) {
  const res = mkRes();
  await handler({ method, query: opts.query ?? {}, body: opts.body, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}

describe('/api/admin/kombine', () => {
  beforeEach(() => {
    h.admin = true;
    loadCandidates.mockReset().mockResolvedValue([cand]);
    resolveOdds.mockReset().mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('bayrak kapalı → 404 (admin için de), hiçbir yükleme çağrılmaz', async () => {
    const r = await call('GET', { query: { date: '2026-11-12' } });
    expect(r.statusCode).toBe(404);
    expect(loadCandidates).not.toHaveBeenCalled();
    expect(await getServerSideProps({} as never)).toEqual({ notFound: true });
  });

  it('bayrak açık + admin değil → 401', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    h.admin = false;
    expect((await call('GET', { query: { date: '2026-11-12' } })).statusCode).toBe(401);
  });

  it('GET: adaylar + geçmiş; önbelleksiz + noindex; geçersiz tarih 400', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    const r = await call('GET', { query: { date: '2026-11-12' } });
    expect(r.statusCode).toBe(200);
    expect((r.body as { candidates: unknown[] }).candidates).toHaveLength(1);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(r.headers['x-robots-tag']).toContain('noindex');
    expect((await call('GET', { query: { date: 'bugün' } })).statusCode).toBe(400);
  });

  it('POST: yalnız seçilen maçlar için oran; pazar anahtarı sunucudan (istemciden alınmaz)', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    loadCandidates.mockResolvedValue([cand, { ...cand, matchId: '11' }]);
    const r = await call('POST', { body: { date: '2026-11-12', picks: [{ matchId: '10', key: 'home' }] } });
    expect(r.statusCode).toBe(200);
    expect(resolveOdds).toHaveBeenCalledTimes(1);
    const arg = resolveOdds.mock.calls[0][0] as Array<{ matchId: string; key: string; kickoffMs: number }>;
    expect(arg).toHaveLength(1);
    expect(arg[0]).toMatchObject({ matchId: '10', key: 'over15', kickoffMs: Date.parse(cand.kickoffIso) });
  });

  it('POST: boş / 12\'den fazla seçim → 400, oran isteği yok', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    expect((await call('POST', { body: { date: '2026-11-12', picks: [] } })).statusCode).toBe(400);
    const many = Array.from({ length: 13 }, (_, i) => ({ matchId: String(i) }));
    expect((await call('POST', { body: { date: '2026-11-12', picks: many } })).statusCode).toBe(400);
    expect(resolveOdds).not.toHaveBeenCalled();
  });

  it('PUT → 405', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    expect((await call('PUT')).statusCode).toBe(405);
  });
});
