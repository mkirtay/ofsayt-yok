import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SportmonksEventRow, SportmonksFixture } from '@/services/sportmonks/types';

vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('./fakeDraftDb.testutil');
  return { prisma: createFakeDb() };
});
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/livescoreCache', () => ({ readCache: vi.fn(), writeCache: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksCollectAllPages: vi.fn(), sportmonksClientRequest: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { runBotTick, startedRecently, type TickDeps } from './tick';

const db = prisma as unknown as { __rows: () => any[]; __reset: () => void }; // eslint-disable-line @typescript-eslint/no-explicit-any

const NOW = new Date('2026-09-22T19:00:00Z');
let seq = 500;
const ev = (o: Partial<SportmonksEventRow> & { type_id: number; minute: number }): SportmonksEventRow => {
  seq += 1;
  return { id: seq, fixture_id: 1, participant_id: 10, player_id: 7, player_name: 'Icardi', ...o };
};
const fixture = (events: SportmonksEventRow[], over: Partial<SportmonksFixture> = {}): SportmonksFixture => ({
  id: 1,
  league_id: 600,
  season_id: 99,
  starting_at: '2026-09-22 18:00:00',
  league: { id: 600, name: 'Super Lig' },
  participants: [
    { id: 10, name: 'Galatasaray', meta: { location: 'home', winner: null } },
    { id: 20, name: 'Fenerbahçe', meta: { location: 'away', winner: null } },
  ],
  events,
  ...over,
});
const deps = (fixtures: SportmonksFixture[]): TickDeps => ({
  fetchInplay: async () => fixtures,
  getScorers: async () => [{ playerId: 7, goals: 3 }],
  now: () => NOW,
});

beforeEach(() => db.__reset());

describe('runBotTick', () => {
  it('yeni golden PENDING taslak yazar; ikinci tick tekrar üretmez (tek kez işleme)', async () => {
    const g = ev({ type_id: 14, minute: 12 });
    const fx = [fixture([g])];
    const a = await runBotTick(deps(fx));
    expect(a).toMatchObject({ tracked: 1, created: 1 });
    const row = db.__rows()[0];
    expect(row).toMatchObject({ status: 'PENDING', kind: 'GOAL', fixtureId: 1, eventId: g.id, externalKey: `goal:1:${g.id}` });
    expect(row.body).toContain('GOL!');
    const b = await runBotTick(deps(fx));
    expect(b.created).toBe(0);
    expect(db.__rows()).toHaveLength(1);
  });

  it('takip edilmeyen lig yok sayılır', async () => {
    const r = await runBotTick(deps([fixture([ev({ type_id: 14, minute: 3 })], { league_id: 9999 })]));
    expect(r).toMatchObject({ inplay: 1, tracked: 0, created: 0 });
    expect(db.__rows()).toHaveLength(0);
  });

  it('gol olmayan olaylar (kart, oyuncu değişikliği) taslak üretmez', async () => {
    const r = await runBotTick(deps([fixture([ev({ type_id: 19, minute: 5 }), ev({ type_id: 18, minute: 60 })])]));
    expect(r.created).toBe(0);
  });

  it('event id yeniden verilse bile aynı (dakika, oyuncu) imzası tekrar üretilmez', async () => {
    const g = ev({ type_id: 14, minute: 12 });
    await runBotTick(deps([fixture([g])]));
    const reissued = { ...g, id: g.id + 9000 };
    const r = await runBotTick(deps([fixture([g, reissued])]));
    expect(r.created).toBe(0);
    expect(r.duplicates).toBe(1);
  });

  it('olayı listeden kalkan bekleyen taslak STALE olur (VAR iptali)', async () => {
    const g1 = ev({ type_id: 14, minute: 12 });
    const g2 = ev({ type_id: 14, minute: 40, player_name: 'Mertens', player_id: 8 });
    await runBotTick(deps([fixture([g1, g2])]));
    const r = await runBotTick(deps([fixture([g1, ev({ type_id: 19, minute: 41 })])]));
    expect(r.staled).toBe(1);
    expect(db.__rows().find((x) => x.eventId === g2.id).status).toBe('STALE');
    expect(db.__rows().find((x) => x.eventId === g1.id).status).toBe('PENDING');
  });

  it('boş olay listesi (veri hatası) mevcut taslakları eskitmez', async () => {
    const g = ev({ type_id: 14, minute: 12 });
    await runBotTick(deps([fixture([g])]));
    const r = await runBotTick(deps([fixture([])]));
    expect(r.staled).toBe(0);
    expect(db.__rows()[0].status).toBe('PENDING');
  });

  it('bir tickte geç yakalanan eski gol "backlog" uyarısı alır; en yeni gol almaz', async () => {
    const old = ev({ type_id: 14, minute: 5, player_name: 'A', player_id: 1 });
    const latest = ev({ type_id: 14, minute: 50, player_name: 'B', player_id: 2 });
    await runBotTick(deps([fixture([old, latest])]));
    const rows = db.__rows();
    expect(rows.find((r) => r.eventId === old.id).warnings.some((w: string) => w.startsWith('backlog'))).toBe(true);
    expect(rows.find((r) => r.eventId === latest.id).warnings.some((w: string) => w.startsWith('backlog'))).toBe(false);
  });

  it('fixture başına yeni taslak sayısı sınırlıdır', async () => {
    const goals = Array.from({ length: 8 }, (_, i) => ev({ type_id: 14, minute: i + 1, player_name: `P${i}`, player_id: 100 + i }));
    const r = await runBotTick(deps([fixture(goals)]));
    expect(r.created).toBe(5);
    expect(r.skipped).toBe(3);
  });

  it('eski/bayat başlangıç zamanı elenir', () => {
    expect(startedRecently('2026-09-22 18:00:00', NOW)).toBe(true);
    expect(startedRecently('2026-09-19 18:00:00', NOW)).toBe(false);
    expect(startedRecently(null, NOW)).toBe(true);
  });
});
