import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({ valid: true }));
vi.mock('@/lib/gundem/botAuth', () => ({ isValidCronRequest: () => h.valid }));
const run = vi.hoisted(() => vi.fn());
vi.mock('@/server/combo/oddsSnapshot', () => ({ runComboOddsSnapshot: run }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import handler from '@/pages/api/cron/combo-odds';

function call(method = 'POST', query: Record<string, string> = {}) {
  const res = {
    statusCode: 200, body: undefined as unknown,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    end() { return this; },
    setHeader() { return this; },
  };
  return handler({ method, query, headers: {} } as unknown as NextApiRequest, res as unknown as NextApiResponse).then(() => res);
}

describe('/api/cron/combo-odds', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    run.mockReset();
    h.valid = true;
  });

  it('bayrak kapalı → 404 ve hiçbir iş yok (geçerli sır olsa bile)', async () => {
    expect((await call()).statusCode).toBe(404);
    expect(run).not.toHaveBeenCalled();
  });

  it('sır yok / yanlış → 401; sır benzeri query → 400; GET → 405; hiçbirinde iş yok', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    h.valid = false;
    expect((await call()).statusCode).toBe(401);
    h.valid = true;
    expect((await call('POST', { secret: 'x' })).statusCode).toBe(400);
    expect((await call('GET')).statusCode).toBe(405);
    expect(run).not.toHaveBeenCalled();
  });

  it('geçerli sır: özet döner; iş hatası → 500', async () => {
    vi.stubEnv('COMBO_TOOL_ENABLED', '1');
    run.mockResolvedValueOnce({ candidates: 3, withOdds: 2, national: 0, written: 2 });
    const r = await call();
    expect(r.statusCode).toBe(200);
    expect(r.body).toEqual({ ok: true, summary: { candidates: 3, withOdds: 2, national: 0, written: 2 } });
    run.mockRejectedValueOnce(new Error('boom'));
    expect((await call()).statusCode).toBe(500);
  });
});
