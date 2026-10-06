import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: new Map<string, unknown>(), messages: [] as Array<{ msg: string; level?: string }>, exceptions: 0 }));
vi.mock('@/lib/redis', () => ({
  withRedis: async <T,>(fn: (r: unknown) => Promise<T>) =>
    fn({
      set: async (k: string, v: unknown, o: { nx?: boolean } = {}) => {
        if (o.nx && h.store.has(k)) return null;
        h.store.set(k, v);
        return 'OK';
      },
      get: async (k: string) => h.store.get(k) ?? null,
      del: async (k: string) => h.store.delete(k),
    }),
}));
vi.mock('@/lib/cacheNamespace', () => ({ cacheKeyPrefix: () => 't:' }));
vi.mock('@sentry/nextjs', () => ({
  captureMessage: (msg: string, o: { level?: string }) => h.messages.push({ msg, level: o?.level }),
  captureException: () => {
    h.exceptions++;
  },
}));

import { acquireCronLock, isCronRequest, readCronHeartbeat, recordCronTick, runCronJob, staleGapMs } from './cronJobs';

const summarize = (r: { n: number }) => ({ evaluated: r.n });

describe('zamanlanmış işler — kilit, nabız, uyarı', () => {
  beforeEach(() => {
    h.store.clear();
    h.messages = [];
    h.exceptions = 0;
  });

  it('iş çalışırken ikinci çağrı busy; bitince kilit bırakılır ve nabız yazılır', async () => {
    const held = await acquireCronLock('evaluate-predictions');
    expect(await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 1 }), summarize)).toEqual({ status: 'busy' });
    const r = await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 3 }), summarize, { lock: held });
    expect(r).toMatchObject({ status: 'done', result: { n: 3 } });
    expect(h.store.has('t:cron-lock:evaluate-predictions')).toBe(false);
    expect(await readCronHeartbeat('evaluate-predictions')).toMatchObject({ ok: true, phase: 'done', trigger: 'cron', summary: { evaluated: 3 } });
  });

  it('iş olmayan tick: lastRunAt ilerler, lastWorkAt önceki işten taşınır; iş olunca lastWorkAt ilerler', async () => {
    await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 2 }), summarize);
    const first = (await readCronHeartbeat('evaluate-predictions'))!;
    expect(first.lastWorkAt).toBe(first.lastRunAt);
    h.store.set('t:cron-heartbeat:evaluate-predictions', { ...first, lastRunAt: '2026-10-05T10:00:00.000Z', lastWorkAt: '2026-10-05T09:00:00.000Z' });
    await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 0 }), summarize);
    const idle = (await readCronHeartbeat('evaluate-predictions'))!;
    expect(idle.lastWorkAt).toBe('2026-10-05T09:00:00.000Z');
    expect(Date.now() - Date.parse(idle.lastRunAt)).toBeLessThan(5_000);
    expect(idle).toMatchObject({ ok: true, phase: 'done', summary: { evaluated: 0 } });
  });

  it('cron 202 yolu: tick nabzı işten önce yazılır (phase started); runCronJob ticked ile yeniden yazmaz, bitişte done', async () => {
    h.store.set('t:cron-heartbeat:analysis-pregenerate', { lastRunAt: '2026-10-05T10:00:00.000Z', lastWorkAt: '2026-10-05T09:00:00.000Z', ms: 1, ok: true, summary: {}, trigger: 'cron' });
    const lock = await acquireCronLock('analysis-pregenerate');
    const ticked = await recordCronTick('analysis-pregenerate', 'cron');
    const started = (await readCronHeartbeat('analysis-pregenerate'))!;
    expect(started).toMatchObject({ phase: 'started', ok: true, lastWorkAt: '2026-10-05T09:00:00.000Z', trigger: 'cron' });
    expect(Date.now() - Date.parse(started.lastRunAt)).toBeLessThan(5_000);
    // Arka plan işi dondurulsa bile "son çalışma" güncel.
    const r = await runCronJob('analysis-pregenerate', 'cron', async () => ({ n: 0 }), summarize, { lock, ticked });
    expect(r.status).toBe('done');
    const done = (await readCronHeartbeat('analysis-pregenerate'))!;
    expect(done).toMatchObject({ phase: 'done', lastRunAt: started.lastRunAt, lastWorkAt: '2026-10-05T09:00:00.000Z' });
    expect(h.store.has('t:cron-lock:analysis-pregenerate')).toBe(false);
  });

  it('hata: Sentry error, nabız ok=false, kilit bırakılır', async () => {
    const r = await runCronJob('analysis-pregenerate', 'admin', async () => {
      throw new Error('patladı');
    }, () => ({}));
    expect(r.status).toBe('failed');
    expect(h.exceptions).toBe(1);
    expect(await readCronHeartbeat('analysis-pregenerate')).toMatchObject({ ok: false, trigger: 'admin' });
    expect(h.store.has('t:cron-lock:analysis-pregenerate')).toBe(false);
  });

  it('önceki çalışma 45 dk\'dan eskiyse başlarken Sentry warning; ilk çalışmada uyarı yok', async () => {
    await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 0 }), summarize);
    expect(h.messages).toHaveLength(0);
    h.store.set('t:cron-heartbeat:evaluate-predictions', { lastRunAt: new Date(Date.now() - 50 * 60_000).toISOString(), ms: 1, ok: true, summary: {}, trigger: 'cron' });
    await runCronJob('evaluate-predictions', 'cron', async () => ({ n: 0 }), summarize);
    expect(h.messages).toEqual([{ msg: 'Zamanlanmış iş 50 dk çalışmamış: evaluate-predictions', level: 'warning' }]);
    expect(staleGapMs({ lastRunAt: new Date().toISOString(), ms: 0, ok: true, summary: {}, trigger: 'cron' }, Date.now())).toBeNull();
  });

  it('Bearer kontrolü: yalnız birebir CRON_SECRET', () => {
    process.env.CRON_SECRET = 'gizli';
    expect(isCronRequest('Bearer gizli')).toBe(true);
    expect(isCronRequest('Bearer yanlis')).toBe(false);
    expect(isCronRequest(undefined)).toBe(false);
    delete process.env.CRON_SECRET;
    expect(isCronRequest('Bearer ')).toBe(false);
  });
});
