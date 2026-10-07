import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const h = vi.hoisted(() => ({
  userId: null as string | null,
  viewer: null as Record<string, unknown> | null,
  quota: { allowed: true, remaining: 2, limit: 3 } as Record<string, unknown>,
  rate: true,
  outcome: 'answered',
  /** 'ok' | 'hang' (iptal sinyaline kadar bekler) | 'throw' */
  mode: 'ok' as 'ok' | 'hang' | 'throw',
  partialUsage: null as { input: number; cached: number; output: number } | null,
  monthly: true,
  settled: [] as Array<{ counted: boolean; cost: number | null }>,
  monthlySettled: [] as Array<number | null>,
  quotaArgs: [] as Array<{ tier: string; keys: string[] }>,
  runArgs: null as Record<string, unknown> | null,
}));

vi.mock('openai', () => ({ default: class {} }));
vi.mock('@/lib/mobileAuth', () => ({ getRequestAuth: vi.fn(async () => (h.userId ? { id: h.userId } : null)) }));
vi.mock('@/server/analysisAccess', () => ({ loadViewer: vi.fn(async () => h.viewer) }));
vi.mock('@/lib/rateLimit', () => ({ hitFixedWindowRateLimit: vi.fn(async () => ({ success: h.rate, remaining: 1, resetAt: Date.now() + 5000 })), requestIp: () => '85.100.20.7' }));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/server/sportmonks/cachedFetch', () => ({ trackSportmonksFetches: async <T,>(fn: () => Promise<T>) => ({ value: await fn(), upstream: 2, calls: 5, stale: false, failed: false }) }));
vi.mock('@/server/assistant/quota', () => ({
  ASSISTANT_ESTIMATE_MICRO_USD: 4000,
  guestIpKey: () => 'ip:ozet',
  reserveAssistantQuota: vi.fn(async (tier: string, keys: string[]) => {
    h.quotaArgs.push({ tier, keys });
    if (!h.quota.allowed) return h.quota;
    const limit = Number(h.quota.limit);
    const remaining = Number(h.quota.remaining);
    return { allowed: true, remaining, limit, reservation: { keys, day: '2026-10-07', limit, remaining, estimate: 4000, store: 'redis' } };
  }),
  settleAssistantUsage: vi.fn(async (_r: unknown, result: { counted: boolean; costMicroUsd: number | null }) => {
    h.settled.push({ counted: result.counted, cost: result.costMicroUsd });
  }),
}));
vi.mock('@/server/llmBudget', () => ({
  reserveLlmBudget: vi.fn(async () => (h.monthly ? { month: '2026-10', estimate: 4000, store: 'redis' } : null)),
  settleLlmBudget: vi.fn(async (_r: unknown, actual: number | null) => {
    h.monthlySettled.push(actual);
  }),
}));
vi.mock('@/server/assistant/chat', () => ({
  assistantCostMicroUsd: (u: { input: number; output: number }) => u.input + u.output,
  runAssistantChat: vi.fn(async (opts: { emit: (e: unknown) => void; messages: unknown; ctx: unknown; pagePath: unknown; signal: AbortSignal; onUsage?: (u: unknown) => void }) => {
    h.runArgs = { messages: opts.messages, ctx: opts.ctx, pagePath: opts.pagePath };
    if (h.partialUsage) opts.onUsage?.(h.partialUsage);
    if (h.mode === 'throw') throw new Error('model patladı');
    if (h.mode === 'hang') {
      await new Promise<never>((_, reject) => {
        const e = new Error('iptal');
        e.name = 'AbortError';
        opts.signal.addEventListener('abort', () => reject(e));
      });
    }
    if (h.outcome !== 'empty') {
      opts.emit({ type: 'card', card: { type: 'matches', matches: [] } });
      opts.emit({ type: 'delta', text: 'Merhaba.' });
      opts.emit({ type: 'links', links: [{ label: 'Maç', href: '/matches/1-a-b' }] });
    }
    return { outcome: h.outcome, tools: ['get_fixtures'], usage: { input: 100, cached: 0, output: 10 }, costMicroUsd: 15 };
  }),
}));

import handler, { parseChatMessages } from '@/pages/api/assistant/chat';

function postOpen(body: unknown, cookies: Record<string, string> = {}) {
  const res = {
    statusCode: 200, body: undefined as unknown, headers: {} as Record<string, unknown>, chunks: [] as string[], ended: false,
    status(c: number) { this.statusCode = c; return this; },
    json(b: unknown) { this.body = b; return this; },
    setHeader(k: string, v: unknown) { this.headers[k] = v; },
    writeHead(c: number, hd: Record<string, unknown>) { this.statusCode = c; Object.assign(this.headers, hd); },
    write(s: string) { this.chunks.push(s); return true; },
    end() { this.ended = true; },
    handlers: {} as Record<string, () => void>,
    on(ev: string, cb: () => void) { this.handlers[ev] = cb; },
  };
  const req = { method: 'POST', body, headers: {}, cookies, socket: {}, on() {} } as unknown as NextApiRequest;
  return { res, done: Promise.resolve(handler(req, res as unknown as NextApiResponse)) };
}
function post(body: unknown, cookies: Record<string, string> = {}) {
  const { res, done } = postOpen(body, cookies);
  return done.then(() => res);
}
const events = (res: { chunks: string[] }) => res.chunks.map((c) => /^event: (\w+)\ndata: (.*)\n\n$/.exec(c)!).map((m) => ({ event: m[1], data: JSON.parse(m[2]!) }));
const SECRET_QUESTION = 'GIZLI_SORU_METNI bugün hangi maçlar var';

describe('POST /api/assistant/chat', () => {
  let logs: string[];
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test';
    h.userId = null;
    h.viewer = null;
    h.quota = { allowed: true, remaining: 2, limit: 3 };
    h.rate = true;
    h.outcome = 'answered';
    h.mode = 'ok';
    h.partialUsage = null;
    h.monthly = true;
    h.settled = [];
    h.monthlySettled = [];
    h.quotaArgs = [];
    h.runArgs = null;
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((s: unknown) => void logs.push(String(s)));
  });

  it('misafir: SSE akışı (card → delta → links → done), kota IP + çerezle, çerez atanır', async () => {
    const res = await post({ messages: [{ role: 'user', content: SECRET_QUESTION }], locale: 'tr', page: '/matches/1-a-b?x=<script>' });
    expect(res.headers['Content-Type']).toContain('text/event-stream');
    expect(events(res).map((e) => e.event)).toEqual(['card', 'delta', 'links', 'done']);
    expect(events(res).at(-1)!.data).toEqual({ remaining: 2, limit: 3, tier: 'guest' });
    expect(String(res.headers['Set-Cookie'])).toMatch(/^oy_aid=[\w-]+; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax/);
    expect(h.quotaArgs[0]!.tier).toBe('guest');
    expect(h.quotaArgs[0]!.keys[0]).toBe('ip:ozet');
    expect(h.quotaArgs[0]!.keys[1]).toMatch(/^c:/);
    expect(h.settled).toEqual([{ counted: true, cost: 15 }]);
    expect(h.monthlySettled).toEqual([15]);
    expect(h.runArgs).toMatchObject({ pagePath: '/matches/1-a-b', ctx: { viewer: null, locale: 'tr' } });
    expect(res.ended).toBe(true);
  });

  it('log anonim: soru metni, kullanıcı id\'si, IP ve çerez yok', async () => {
    h.userId = 'user-123';
    h.viewer = { id: 'user-123', role: 'USER', premiumUntil: null };
    await post({ messages: [{ role: 'user', content: SECRET_QUESTION }] }, { oy_aid: 'cerez-abcdef12' });
    const line = logs.find((l) => l.includes('assistant-chat'))!;
    expect(JSON.parse(line)).toEqual({ event: 'assistant-chat', tier: 'user', locale: 'tr', outcome: 'answered', tools: ['get_fixtures'], tokens: { input: 100, cached: 0, output: 10 }, costMicroUsd: 15, ms: expect.any(Number), sportmonksUpstream: 2 });
    expect(line).not.toMatch(/GIZLI_SORU|user-123|85\.100|cerez-abcdef12|ip:ozet/);
  });

  it('kademeler: üye → user, premium ve yönetici → premium; anahtar kullanıcı id\'si', async () => {
    h.userId = 'u1';
    h.viewer = { id: 'u1', role: 'USER', premiumUntil: null };
    await post({ messages: [{ role: 'user', content: 'a' }] });
    h.viewer = { id: 'u1', role: 'USER', premiumUntil: new Date(Date.now() + 86400_000) };
    await post({ messages: [{ role: 'user', content: 'a' }] });
    h.viewer = { id: 'u1', role: 'ADMIN', premiumUntil: null };
    await post({ messages: [{ role: 'user', content: 'a' }] });
    expect(h.quotaArgs.map((q) => q.tier)).toEqual(['user', 'premium', 'premium']);
    expect(h.quotaArgs[0]!.keys).toEqual(['u:u1']);
  });

  it('kota / bütçe / misafir kapalı / hız: akış başlamadan 429 + kod; model çağrılmaz', async () => {
    for (const reason of ['QUOTA', 'BUDGET', 'UNAVAILABLE']) {
      h.quota = { allowed: false, reason, limit: 3 };
      const res = await post({ messages: [{ role: 'user', content: 'a' }] });
      expect(res.statusCode).toBe(429);
      expect(res.body).toMatchObject({ code: reason, tier: 'guest', limit: 3 });
      expect(res.chunks).toEqual([]);
    }
    h.quota = { allowed: true, remaining: 2, limit: 3 };
    h.rate = false;
    expect((await post({ messages: [{ role: 'user', content: 'a' }] })).body).toMatchObject({ code: 'RATE' });
    expect(h.settled).toEqual([]);
    expect(h.quotaArgs).toHaveLength(3); // hız reddinde kota hiç ayrılmaz
  });

  it('aylık OpenAI bütçesi dolu: 429 BUDGET_MONTHLY, günlük hak iade edilir, model çağrılmaz', async () => {
    h.monthly = false;
    const res = await post({ messages: [{ role: 'user', content: 'a' }] });
    expect(res.statusCode).toBe(429);
    expect(res.body).toMatchObject({ code: 'BUDGET_MONTHLY', tier: 'guest', limit: 3 });
    expect(res.chunks).toEqual([]);
    expect(h.settled).toEqual([{ counted: false, cost: 0 }]);
    expect(h.runArgs).toBeNull();
  });

  it('25 sn zaman aşımı: TIMEOUT olayı; hak SAYILIR, bütçeye kısmi kullanım ya da tahmini üst sınır (hangisi büyükse) yazılır', async () => {
    vi.useFakeTimers();
    try {
      h.mode = 'hang';
      const pending = post({ messages: [{ role: 'user', content: 'a' }] });
      await vi.advanceTimersByTimeAsync(25_000);
      const res = await pending;
      expect(events(res).map((e) => e.event)).toEqual(['error']);
      expect(events(res)[0]!.data).toEqual({ code: 'TIMEOUT' });
      expect(h.settled).toEqual([{ counted: true, cost: 4000 }]);
      expect(h.monthlySettled).toEqual([4000]);
      expect(res.ended).toBe(true);

      h.settled = [];
      h.partialUsage = { input: 9000, cached: 0, output: 500 };
      const pending2 = post({ messages: [{ role: 'user', content: 'a' }] });
      await vi.advanceTimersByTimeAsync(25_000);
      await pending2;
      expect(h.settled).toEqual([{ counted: true, cost: 9500 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('istemci bağlantıyı keserse: çalışma durur, hak yine sayılır (kesmek kotayı atlatmaz)', async () => {
    h.mode = 'hang';
    const { res, done } = postOpen({ messages: [{ role: 'user', content: 'a' }] });
    for (let i = 0; i < 50 && !h.runArgs; i++) await new Promise((r) => setTimeout(r, 1));
    expect(h.runArgs).not.toBeNull();
    expect(res.ended).toBe(false);
    res.handlers.close!();
    await done;
    expect(events(res).map((e) => e.event)).toEqual(['error']);
    expect(events(res)[0]!.data).toEqual({ code: 'TIMEOUT' });
    expect(h.settled).toEqual([{ counted: true, cost: 4000 }]);
    expect(res.ended).toBe(true);
  });

  it('model hatası: ERROR olayı, hak sayılır, bütçeye tahmini üst sınır yazılır, log maliyeti taşır', async () => {
    h.mode = 'throw';
    const res = await post({ messages: [{ role: 'user', content: 'a' }] });
    expect(events(res).map((e) => e.event)).toEqual(['error']);
    expect(events(res)[0]!.data).toEqual({ code: 'ERROR' });
    expect(h.settled).toEqual([{ counted: true, cost: 4000 }]);
    expect(h.monthlySettled).toEqual([4000]);
    expect(JSON.parse(logs.find((l) => l.includes('assistant-chat'))!)).toMatchObject({ outcome: 'error', costMicroUsd: 4000 });
  });

  it('bahis süzgeci → refused olayı (hak düşer); boş yanıt → error, hak düşmez ama maliyet bütçeye yazılır', async () => {
    h.outcome = 'filtered';
    expect(events(await post({ messages: [{ role: 'user', content: 'a' }] })).map((e) => e.event)).toContain('refused');
    expect(h.settled[0]).toEqual({ counted: true, cost: 15 });
    h.outcome = 'empty';
    const res = await post({ messages: [{ role: 'user', content: 'a' }] });
    expect(events(res).map((e) => e.event)).toEqual(['error', 'done']);
    expect(events(res).at(-1)!.data).toMatchObject({ remaining: 3 });
    expect(h.settled[1]).toEqual({ counted: false, cost: 15 });
  });

  it('gövde doğrulama: sistem rolü, uzun mesaj, son mesaj asistan, boş → 400', async () => {
    expect(parseChatMessages([{ role: 'system', content: 'x' }, { role: 'user', content: 'a' }])).toBeNull();
    expect(parseChatMessages([{ role: 'user', content: 'x'.repeat(301) }])).toBeNull();
    expect(parseChatMessages([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }])).toBeNull();
    expect(parseChatMessages([])).toBeNull();
    expect(parseChatMessages(Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })).concat([{ role: 'user', content: 'son' }]))).toHaveLength(6);
    expect((await post({ messages: 'x' })).statusCode).toBe(400);
  });
});
