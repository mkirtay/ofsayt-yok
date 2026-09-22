import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/lib/gundem/bot/tick', () => ({ runBotTick: vi.fn(async () => ({ created: 2 })) }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/admin/gundem/bot-tick';

function run(req: Partial<NextApiRequest>) {
  const out = { status: 0, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
    status(code: number) { out.status = code; return res; },
    json(b: unknown) { out.body = b; return res; },
    end() { return res; },
  } as unknown as NextApiResponse;
  return handler({ method: 'POST', query: {}, headers: {}, ...req } as NextApiRequest, res).then(() => out);
}

describe('POST /api/admin/gundem/bot-tick', () => {
  beforeEach(() => { process.env.CRON_SECRET = 's3cret'; });

  it('POST dışı 405', async () => {
    expect((await run({ method: 'GET' })).status).toBe(405);
  });

  it('Authorization başlığı yok/yanlış → 401', async () => {
    expect((await run({})).status).toBe(401);
    expect((await run({ headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('sır query string ile gelirse (geçerli olsa bile) reddedilir', async () => {
    const r = await run({ query: { secret: 's3cret' }, headers: { authorization: 'Bearer s3cret' } });
    expect(r.status).toBe(400);
    expect((await run({ query: { token: 'x' } })).status).toBe(400);
  });

  it('geçerli Bearer başlığı → 200 + özet', async () => {
    const r = await run({ headers: { authorization: 'Bearer s3cret' } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, summary: { created: 2 } });
  });

  it('CRON_SECRET tanımsızsa hiçbir başlık kabul edilmez', async () => {
    delete process.env.CRON_SECRET;
    expect((await run({ headers: { authorization: 'Bearer undefined' } })).status).toBe(401);
  });
});
