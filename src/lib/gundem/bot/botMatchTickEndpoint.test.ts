import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/gundem/bot/matchPostsTick', () => ({ runMatchPostsTick: vi.fn(async () => ({ preview: { created: 1 }, recap: { created: 0 } })) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/admin/gundem/bot-match-tick';
import { runMatchPostsTick } from '@/lib/gundem/bot/matchPostsTick';

function run(req: Partial<NextApiRequest>) {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    setHeader: () => {},
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
  } as unknown as NextApiResponse;
  return handler({ method: 'POST', query: {}, headers: {}, ...req } as NextApiRequest, res).then(() => out);
}
const auth = { authorization: 'Bearer s3cret' };

describe('POST /api/admin/gundem/bot-match-tick', () => {
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; });

  it('POST dışı 405; Bearer yok/yanlış 401; sır query ile 400', async () => {
    expect((await run({ method: 'GET' })).status).toBe(405);
    expect((await run({})).status).toBe(401);
    expect((await run({ headers: { authorization: 'Bearer x' } })).status).toBe(401);
    expect((await run({ query: { secret: 's3cret' }, headers: auth })).status).toBe(400);
  });

  it('geçerli Bearer → 200 + özet', async () => {
    expect(await run({ headers: auth })).toEqual({ status: 200, body: { ok: true, summary: { preview: { created: 1 }, recap: { created: 0 } } } });
  });

  it('beklenmeyen hata 500 DÖNDÜRMEZ (cron devre dışı kalmasın): 200 + degraded', async () => {
    vi.mocked(runMatchPostsTick).mockRejectedValueOnce(new Error('boom'));
    expect(await run({ headers: auth })).toEqual({ status: 200, body: { ok: false, degraded: true } });
  });
});
