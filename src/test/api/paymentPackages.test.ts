/** GET /api/payments/packages: yalnız satıştaki KREDİ paketleri (test paketi yok), satış kapalıyken boş; link/secret sızmaz. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/payments/packages';

function call() {
  const out: { status: number; json: unknown; headers: Record<string, string> } = { status: 200, json: null, headers: {} };
  const res = {
    status(n: number) {
      out.status = n;
      return this;
    },
    json(j: unknown) {
      out.json = j;
      return this;
    },
    setHeader(k: string, v: string) {
      out.headers[k] = v;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as NextApiResponse;
  handler({ method: 'GET' } as NextApiRequest, res);
  return out;
}

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/payments/packages', () => {
  it('satış kapalı → boş liste', () => {
    vi.stubEnv('PAYMENTS_ENABLED', '');
    expect(call().json).toEqual({ available: [] });
  });

  it('satış açık: linki olan kredi paketleri; test paketi ve link değerleri yanıtta yok', () => {
    vi.stubEnv('PAYMENTS_ENABLED', 'true');
    vi.stubEnv('HIKIE_WEBHOOK_SECRET', 'whsec_x');
    vi.stubEnv('HIKIE_LINK_CREDITS_10', 'https://pay.example/l/10');
    vi.stubEnv('HIKIE_LINK_CREDITS_100', 'https://pay.example/l/100');
    vi.stubEnv('HIKIE_LINK_TEST_1TL', 'https://pay.example/l/t');
    const out = call();
    expect(out.json).toEqual({ available: ['credits_10', 'credits_100'] });
    expect(JSON.stringify(out.json)).not.toContain('pay.example');
    expect(out.headers['Cache-Control']).toMatch(/s-maxage=300/);
  });
});
