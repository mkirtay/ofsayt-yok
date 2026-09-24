import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchSnapshot } from '@prisma/client';
import type { SportmonksFixture } from '@/services/sportmonks/types';

const store = vi.hoisted(() => new Map<string, MatchSnapshot>());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchSnapshot: {
      findUnique: vi.fn(async ({ where }: { where: { fixtureId: string } }) => store.get(where.fixtureId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { fixtureId: string }; create: MatchSnapshot; update: Partial<MatchSnapshot> }) => {
        const prev = store.get(where.fixtureId);
        const now = new Date();
        const row = prev ? { ...prev, ...update, updatedAt: now } : { ...create, createdAt: now, updatedAt: now };
        store.set(where.fixtureId, row as MatchSnapshot);
        return row;
      }),
    },
  },
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn() }));

import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import {
  MatchSnapshotError,
  SNAPSHOT_REFRESH_AFTER_MS,
  SNAPSHOT_REFRESH_GRACE_MS,
  ensureMatchSnapshot,
  fixtureToSnapshotData,
  isSnapshotStale,
  normalizeFixtureId,
  parseStartingAt,
  refreshMatchSnapshotInBackground,
} from './matchSnapshot';

const fixture = (over: Partial<SportmonksFixture> = {}): SportmonksFixture => ({
  id: 19134567,
  league_id: 600,
  starting_at: '2026-09-27 17:00:00',
  participants: [
    { id: 34, name: 'Galatasaray', image_path: 'https://cdn/gs.png', short_code: 'GAL', meta: { location: 'home', winner: null } },
    { id: 83, name: 'FC Barcelona', image_path: 'https://cdn/fcb.png', short_code: null, meta: { location: 'away', winner: null } },
  ],
  ...over,
});

const snap = (over: Partial<MatchSnapshot> = {}): MatchSnapshot => ({
  fixtureId: '19134567',
  homeTeamId: 34,
  homeName: 'Galatasaray',
  homeShortName: 'GAL',
  homeLogo: null,
  awayTeamId: 83,
  awayName: 'FC Barcelona',
  awayShortName: null,
  awayLogo: null,
  startingAt: new Date('2026-09-27T17:00:00Z'),
  leagueId: 600,
  createdAt: new Date('2026-09-20T00:00:00Z'),
  updatedAt: new Date('2026-09-20T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  store.clear();
  vi.mocked(sportmonksClientRequest).mockReset();
});

describe('normalizeFixtureId', () => {
  it('yok → null; sayı/sayısal string → string', () => {
    expect(normalizeFixtureId(undefined)).toBeNull();
    expect(normalizeFixtureId(null)).toBeNull();
    expect(normalizeFixtureId('')).toBeNull();
    expect(normalizeFixtureId(19134567)).toBe('19134567');
    expect(normalizeFixtureId(' 19134567 ')).toBe('19134567');
  });
  it.each(['abc', '12a', '-5', '1.5', 1.5, {}, true, '1'.repeat(13)])('bozuk biçim %j → invalid-id', (v) => {
    expect(() => normalizeFixtureId(v)).toThrow(MatchSnapshotError);
  });
});

describe('parseStartingAt / fixtureToSnapshotData', () => {
  it('Sportmonks saatini UTC olarak okur', () => {
    expect(parseStartingAt('2026-09-27 17:00:00')?.toISOString()).toBe('2026-09-27T17:00:00.000Z');
    expect(parseStartingAt('bozuk')).toBeNull();
    expect(parseStartingAt(null)).toBeNull();
  });
  it('ev/deplasmanı meta.location ile eşler; short_code yoksa null', () => {
    expect(fixtureToSnapshotData(fixture())).toEqual({
      homeTeamId: 34,
      homeName: 'Galatasaray',
      homeShortName: 'GAL',
      homeLogo: 'https://cdn/gs.png',
      awayTeamId: 83,
      awayName: 'FC Barcelona',
      awayShortName: null,
      awayLogo: 'https://cdn/fcb.png',
      startingAt: new Date('2026-09-27T17:00:00Z'),
      leagueId: 600,
    });
  });
  it('katılımcı ya da saat eksikse null', () => {
    expect(fixtureToSnapshotData(fixture({ participants: [] }))).toBeNull();
    expect(fixtureToSnapshotData(fixture({ starting_at: null }))).toBeNull();
  });
});

describe('isSnapshotStale', () => {
  const start = new Date('2026-09-27T17:00:00Z');
  const s = (updatedAt: Date) => ({ updatedAt, startingAt: start });
  it('taze snapshot yenilenmez', () => {
    const now = new Date(start.getTime() - 24 * 3600_000);
    expect(isSnapshotStale(s(new Date(now.getTime() - SNAPSHOT_REFRESH_AFTER_MS + 1000)), now)).toBe(false);
  });
  it('eski + maç başlamamış → yenilenir', () => {
    const now = new Date(start.getTime() - 24 * 3600_000);
    expect(isSnapshotStale(s(new Date(now.getTime() - SNAPSHOT_REFRESH_AFTER_MS - 1000)), now)).toBe(true);
  });
  it('başlama saatinden sonra tolerans penceresi içinde → yenilenir; dışında (bitmiş) → yenilenmez', () => {
    const old = new Date('2026-09-01T00:00:00Z');
    expect(isSnapshotStale(s(old), new Date(start.getTime() + SNAPSHOT_REFRESH_GRACE_MS - 1000))).toBe(true);
    expect(isSnapshotStale(s(old), new Date(start.getTime() + SNAPSHOT_REFRESH_GRACE_MS + 1000))).toBe(false);
  });
});

describe('ensureMatchSnapshot', () => {
  it('DB\'de yoksa 1 istekle çözer ve kaydeder', async () => {
    vi.mocked(sportmonksClientRequest).mockResolvedValue({ data: fixture() } as never);
    const r = await ensureMatchSnapshot('19134567');
    expect(r).toMatchObject({ fixtureId: '19134567', homeName: 'Galatasaray', awayName: 'FC Barcelona' });
    expect(sportmonksClientRequest).toHaveBeenCalledTimes(1);
    expect(sportmonksClientRequest).toHaveBeenCalledWith('football', '/fixtures/19134567', { include: 'participants' });
    expect(store.has('19134567')).toBe(true);
  });

  it('DB\'de taze snapshot varsa istek atmaz', async () => {
    store.set('19134567', snap({ updatedAt: new Date('2026-09-25T10:00:00Z') }));
    const r = await ensureMatchSnapshot('19134567', { now: () => new Date('2026-09-25T11:00:00Z') });
    expect(r.homeName).toBe('Galatasaray');
    expect(sportmonksClientRequest).not.toHaveBeenCalled();
  });

  it('eski snapshot: mevcut kaydı hemen döndürür, arka planda yeni saati yazar (erteleme)', async () => {
    store.set('19134567', snap());
    const fetchFixture = vi.fn(async () => fixture({ starting_at: '2026-09-28 18:30:00' }));
    const r = await ensureMatchSnapshot('19134567', { fetchFixture, now: () => new Date('2026-09-25T11:00:00Z') });
    expect(r.startingAt.toISOString()).toBe('2026-09-27T17:00:00.000Z'); // bekletmez
    await refreshMatchSnapshotInBackground('19134567', { fetchFixture }); // aynı süreçteki uçuştaki yenilemeye katılır
    expect(fetchFixture).toHaveBeenCalledTimes(1);
    expect(store.get('19134567')?.startingAt.toISOString()).toBe('2026-09-28T18:30:00.000Z');
  });

  it('bitmiş maçın eski snapshot\'ı yenilenmez', async () => {
    store.set('19134567', snap());
    const fetchFixture = vi.fn(async () => fixture());
    await ensureMatchSnapshot('19134567', { fetchFixture, now: () => new Date('2026-10-05T00:00:00Z') });
    expect(fetchFixture).not.toHaveBeenCalled();
  });

  it('arka plan yenilemesi hata verirse yutulur, mevcut kayıt kalır', async () => {
    store.set('19134567', snap());
    const fetchFixture = vi.fn(async () => {
      throw new Error('boom');
    });
    await ensureMatchSnapshot('19134567', { fetchFixture, now: () => new Date('2026-09-25T11:00:00Z') });
    await refreshMatchSnapshotInBackground('19134567', { fetchFixture });
    expect(store.get('19134567')?.homeName).toBe('Galatasaray');
  });

  it('bozuk id → invalid-id, istek atılmaz', async () => {
    await expect(ensureMatchSnapshot('abc')).rejects.toMatchObject({ reason: 'invalid-id' });
    expect(sportmonksClientRequest).not.toHaveBeenCalled();
  });

  it('Sportmonks 404 ya da boş veri → not-found', async () => {
    vi.mocked(sportmonksClientRequest).mockRejectedValueOnce(new SportmonksHttpError('nf', 404, null));
    await expect(ensureMatchSnapshot('1')).rejects.toMatchObject({ reason: 'not-found' });
    vi.mocked(sportmonksClientRequest).mockResolvedValueOnce({ data: null } as never);
    await expect(ensureMatchSnapshot('2')).rejects.toMatchObject({ reason: 'not-found' });
  });

  it('katılımcısı olmayan fixture → not-found, kayıt yazılmaz', async () => {
    vi.mocked(sportmonksClientRequest).mockResolvedValue({ data: fixture({ participants: [] }) } as never);
    await expect(ensureMatchSnapshot('19134567')).rejects.toMatchObject({ reason: 'not-found' });
    expect(store.size).toBe(0);
  });

  it('sağlayıcı 5xx/ağ hatası → upstream', async () => {
    vi.mocked(sportmonksClientRequest).mockRejectedValue(new SportmonksHttpError('down', 503, null));
    await expect(ensureMatchSnapshot('19134567')).rejects.toMatchObject({ reason: 'upstream' });
  });
});
