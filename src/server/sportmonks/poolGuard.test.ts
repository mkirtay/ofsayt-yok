import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  hashes: new Map<string, Record<string, number>>(),
  expires: new Map<string, number>(),
  background: [] as Promise<unknown>[],
}));

vi.mock('@/lib/redis', () => {
  const redis = {
    pipeline() {
      const ops: (() => void)[] = [];
      const p = {
        hincrby(key: string, field: string, n: number) {
          ops.push(() => {
            const hash = h.hashes.get(key) ?? {};
            hash[field] = (hash[field] ?? 0) + n;
            h.hashes.set(key, hash);
          });
          return p;
        },
        expire(key: string, s: number) {
          ops.push(() => h.expires.set(key, s));
          return p;
        },
        async exec() {
          ops.forEach((op) => op());
          return [];
        },
      };
      return p;
    },
    async hgetall(key: string) {
      return h.hashes.get(key) ?? null;
    },
  };
  return { withRedis: async <T,>(fn: (r: typeof redis) => Promise<T>) => fn(redis) };
});
vi.mock('@/server/backgroundTask', () => ({
  runInBackground: (task: () => Promise<unknown>) => {
    h.background.push(task());
  },
}));

import {
  cooldownSecondsFor429,
  flushUsage,
  freshStretchFactor,
  learnPool,
  notePoolObservation,
  poolForPath,
  readUsage,
  recordUpstreamCall,
  resetPoolGuardForTests,
  sportmonksResource,
  usageRowsFromHash,
} from './poolGuard';

const T = Date.parse('2026-10-07T19:30:00Z');

beforeEach(() => {
  resetPoolGuardForTests();
  h.hashes.clear();
  h.expires.clear();
  h.background = [];
});

describe('havuz eşlemesi', () => {
  it('kaynak adı ve başlangıç eşlemesi; yanıttan öğrenilen havuz önceliklidir', () => {
    expect(sportmonksResource('football/fixtures/date/2026-10-07')).toBe('fixtures');
    expect(sportmonksResource('/football/livescores/inplay')).toBe('livescores');
    expect(sportmonksResource('core/types')).toBe('core:types');
    expect(poolForPath('football/livescores/inplay')).toBe('Fixture');
    expect(poolForPath('football/coaches/1')).toBe('coaches');
    learnPool('football/coaches/1', 'Coach');
    expect(poolForPath('football/coaches/99')).toBe('Coach');
  });
});

describe('seyreltme ve soğuma süresi', () => {
  it('kalan kotaya göre çarpan; sıfırlanma geçince bilgi düşer', () => {
    expect(freshStretchFactor('Fixture', T)).toBe(1);
    notePoolObservation('Fixture', 249, 600, T);
    expect(freshStretchFactor('Fixture', T)).toBe(3);
    notePoolObservation('Fixture', 34, 600, T);
    expect(freshStretchFactor('Fixture', T)).toBe(6);
    expect(freshStretchFactor('Fixture', T + 601_000)).toBe(1);
  });

  it('429 bekleme süresi [15 sn, 1 sa] aralığında', () => {
    expect(cooldownSecondsFor429('Fixture', '5', T)).toBe(15);
    expect(cooldownSecondsFor429('Fixture', '99999', T)).toBe(3600);
    expect(cooldownSecondsFor429('Fixture', 'Wed, 21 Oct 2026 07:28:00 GMT', T)).toBe(60);
  });
});

describe('saatlik ölçüm', () => {
  it('rota × havuz × kaynak sayılır, 429 ayrıca; toplu yazılır ve rapor satırlarına çevrilir', async () => {
    recordUpstreamCall({ pool: 'Fixture', route: 'POST /api/admin/gundem/bot-tick', origin: 'server', status: 200 }, T);
    for (let i = 0; i < 3; i++) recordUpstreamCall({ pool: 'Fixture', route: 'GET /api/matches/day', origin: 'server', status: 200 }, T + 1000);
    recordUpstreamCall({ pool: 'Fixture', route: 'POST /api/admin/gundem/bot-tick', origin: 'server', status: 429 }, T + 2000);
    await Promise.all(h.background);
    await flushUsage();

    const key = 'dev:v2:smq:usage:2026-10-07T19';
    expect(h.expires.get(key)).toBe(8 * 24 * 3600);
    const [hour] = await readUsage(1, T);
    expect(hour!.hour).toBe('2026-10-07T19');
    expect(hour!.rows).toEqual([
      { pool: 'Fixture', route: 'GET /api/matches/day', origin: 'server', calls: 3, rateLimited: 0 },
      { pool: 'Fixture', route: 'POST /api/admin/gundem/bot-tick', origin: 'server', calls: 2, rateLimited: 1 },
    ]);
  });

  it('rota adındaki ayırıcı (|) alanı bozmaz', () => {
    expect(usageRowsFromHash({ 'Fixture|GET /a|server': 2, '429|Fixture|GET /a|server': 1 })).toEqual([
      { pool: 'Fixture', route: 'GET /a', origin: 'server', calls: 2, rateLimited: 1 },
    ]);
    recordUpstreamCall({ pool: 'Fixture', route: 'GET /x|y', origin: 'proxy', status: 200 }, T);
  });
});
