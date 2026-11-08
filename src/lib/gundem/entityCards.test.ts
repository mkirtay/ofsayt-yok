import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GundemEntitySnapshot } from '@prisma/client';

const store = vi.hoisted(() => new Map<string, GundemEntitySnapshot>());
const k = (t: string, id: string) => `${t}:${id}`;

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gundemEntitySnapshot: {
      findUnique: vi.fn(async ({ where }: { where: { entityType_entityId: { entityType: string; entityId: string } } }) => {
        const w = where.entityType_entityId;
        return store.get(k(w.entityType, w.entityId)) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { OR: Array<{ entityType: string; entityId: string }> } }) =>
        where.OR.map((w) => store.get(k(w.entityType, w.entityId))).filter(Boolean),
      ),
      upsert: vi.fn(
        async ({ where, create, update }: { where: { entityType_entityId: { entityType: string; entityId: string } }; create: GundemEntitySnapshot; update: Partial<GundemEntitySnapshot> }) => {
          const w = where.entityType_entityId;
          const prev = store.get(k(w.entityType, w.entityId));
          const now = new Date();
          const row = prev ? { ...prev, ...update, updatedAt: now } : { ...create, createdAt: now, updatedAt: now };
          store.set(k(w.entityType, w.entityId), row as GundemEntitySnapshot);
          return row;
        },
      ),
    },
  },
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));

import {
  ENTITY_CARD_VERSION,
  ENTITY_LIVE_REFRESH_MS,
  ENTITY_STATIC_REFRESH_MS,
  EntityCardError,
  MAX_REFRESH_PER_LIST,
  buildMatchCard,
  buildPlayerCard,
  buildTeamCard,
  ensureEntityCard,
  isEntityCardStale,
  loadEntityCards,
  normalizeEntityInput,
  pickTeamStandingSeason,
  type EntityLoaders,
} from './entityCards';
import type { PlayerProfile } from '@/services/playerProfile';
import type { TeamOverview } from '@/services/sportmonks/teamOverview';
import type { Match } from '@/models/liveScore';
import type { GundemMatchCard, GundemPlayerCard, GundemTeamCard } from '@/types/gundem';

const NOW = new Date('2026-11-08T12:00:00Z');

const profile = (over: Partial<PlayerProfile> = {}): PlayerProfile => ({
  id: 1001,
  name: 'Mauro Icardi',
  photo: 'https://cdn/icardi.png',
  currentTeam: { id: 34, name: 'Galatasaray', logo: 'https://cdn/gs.png' },
  seasons: [
    { key: 'a', isCup: false, seasonId: 1, seasonName: '2026/2027', teamId: 34, leagueName: 'Süper Lig', stats: { 321: { total: 10 }, 52: { total: 7, goals: 6 }, 79: { total: 2 } } },
    { key: 'b', isCup: true, seasonId: 2, seasonName: '2026/2027', teamId: 34, leagueName: 'UCL', stats: { 321: { total: 3 }, 52: { total: 2 } } },
    // Başka takımın (eski) satırı toplanmaz
    { key: 'c', isCup: false, seasonId: 3, seasonName: '2026/2027', teamId: 99, leagueName: 'X', stats: { 321: { total: 1 }, 52: { total: 5 } } },
    { key: 'd', isCup: false, seasonId: 4, seasonName: '2025/2026', teamId: 34, leagueName: 'Süper Lig', stats: { 321: { total: 30 }, 52: { total: 20 } } },
  ],
  transfers: [],
  ...over,
});

const match = (over: Partial<Match> = {}): Match => ({
  id: 19134567,
  status: 'IN PLAY',
  time: "67'",
  date: '2026-11-08',
  scheduled: '17:00',
  home: { id: 34, name: 'Galatasaray', logo: 'gs.png' },
  away: { id: 88, name: 'Fenerbahçe', logo: 'fb.png' },
  scores: { score: '2-1' },
  competition: { id: 600, name: 'Süper Lig', logo: 'sl.png' },
  ...over,
});

describe('normalizeEntityInput', () => {
  it('yok → null; geçerli tür + sayı/sayısal metin → ref', () => {
    expect(normalizeEntityInput(undefined)).toBeNull();
    expect(normalizeEntityInput(null)).toBeNull();
    expect(normalizeEntityInput({ type: 'PLAYER', id: 1001 })).toEqual({ type: 'PLAYER', id: 1001 });
    expect(normalizeEntityInput({ type: 'MATCH', id: ' 19134567 ' })).toEqual({ type: 'MATCH', id: 19134567 });
  });

  it.each([
    [{ type: 'USER', id: 1 }],
    [{ type: 'player', id: 1 }],
    [{ type: 'TEAM', id: 0 }],
    [{ type: 'TEAM', id: -3 }],
    [{ type: 'TEAM', id: 1.5 }],
    [{ type: 'TEAM', id: '12abc' }],
    [{ type: 'TEAM', id: '1234567890123' }],
    ['TEAM:1'],
    [[{ type: 'TEAM', id: 1 }]],
  ])('bozuk girdi → invalid (%j)', (v) => {
    expect(() => normalizeEntityInput(v)).toThrow(EntityCardError);
  });
});

describe('kart üreticileri', () => {
  it('oyuncu: güncel sezonun güncel takım satırları toplanır (lig + kupa), son puanlı maçın puanı', () => {
    const card = buildPlayerCard(profile(), [
      { fixtureId: 1, date: '2026-11-01 17:00:00', leagueId: 600, teamId: 34, teamName: 'GS', opponentId: 2, opponentName: 'A', isHome: true, started: true, rating: 7.1 },
      { fixtureId: 2, date: '2026-11-05 17:00:00', leagueId: 600, teamId: 34, teamName: 'GS', opponentId: 3, opponentName: 'B', isHome: true, started: true, rating: 8.24 },
      { fixtureId: 3, date: '2026-11-07 17:00:00', leagueId: 600, teamId: 34, teamName: 'GS', opponentId: 4, opponentName: 'C', isHome: true, started: false },
    ]);
    expect(card).toEqual({
      type: 'PLAYER',
      id: 1001,
      name: 'Mauro Icardi',
      photo: 'https://cdn/icardi.png',
      team: { id: 34, name: 'Galatasaray', logo: 'https://cdn/gs.png' },
      season: { name: '2026/2027', goals: 9, assists: 2, apps: 13 },
      lastRating: 8.24,
    });
  });

  it('oyuncu: istatistik / maç satırı yoksa sezon ve puan null', () => {
    const card = buildPlayerCard(profile({ seasons: [], currentTeam: undefined, photo: undefined }), null);
    expect(card.season).toBeNull();
    expect(card.lastRating).toBeNull();
    expect(card.team).toBeNull();
    expect(card.photo).toBeNull();
  });

  const overview = (over: Partial<TeamOverview> = {}): TeamOverview => ({
    team: { id: 34, name: 'Galatasaray', logo: 'gs.png' },
    recent: [],
    fixtures: [],
    campaigns: [
      {
        name: '2026/2027',
        seasons: [
          { id: 900, name: '2026/2027', leagueId: 2, leagueName: 'Champions League', isCurrent: true, finished: false },
          { id: 901, name: '2026/2027', leagueId: 600, leagueName: 'Süper Lig', leagueLogo: 'sl.png', isCurrent: true, finished: false },
        ],
      },
    ],
    ...over,
  });

  it('takım: varsayılan turnuva sezonu seçilir; tablo (gruplu dahil) satırından sıra/puan', () => {
    const ov = overview();
    const season = pickTeamStandingSeason(ov, 600);
    expect(season?.id).toBe(901);
    const card = buildTeamCard(ov, season, {
      stages: [{ groups: [{ standings: [{ rank: 1, points: 30, matches: 11, goal_diff: 20, won: 9, drawn: 3, lost: 0, team_id: 88 }, { rank: 2, points: 28, matches: 11, goal_diff: 15, won: 9, drawn: 1, lost: 1, team: { id: 34, name: 'GS' } }] }] }],
    });
    expect(card).toEqual({
      type: 'TEAM',
      id: 34,
      name: 'Galatasaray',
      logo: 'gs.png',
      standing: { leagueId: 600, leagueName: 'Süper Lig', leagueLogo: 'sl.png', rank: 2, points: 28 },
    });
    expect(pickTeamStandingSeason(ov, 12345)?.id).toBe(900); // bilinmeyen → ilk
  });

  it('takım: tabloda yoksa sıra null; takım yoksa kart yok', () => {
    const ov = overview();
    expect(buildTeamCard(ov, pickTeamStandingSeason(ov, 600), null)?.standing).toBeNull();
    expect(buildTeamCard(overview({ team: null }), null, null)).toBeNull();
  });

  it('maç: canlı dakika + skor; başlamamış maçta skor yok; bitmişte dakika yok', () => {
    expect(buildMatchCard(match())).toEqual({
      type: 'MATCH',
      id: 19134567,
      league: { id: 600, name: 'Süper Lig', logo: 'sl.png' },
      startingAt: '2026-11-08T17:00:00.000Z',
      status: 'IN PLAY',
      stateCode: null,
      minute: "67'",
      home: { id: 34, name: 'Galatasaray', logo: 'gs.png' },
      away: { id: 88, name: 'Fenerbahçe', logo: 'fb.png' },
      score: [2, 1],
    });
    const pre = buildMatchCard(match({ status: 'NOT STARTED', scores: { score: '0-0' } }));
    expect(pre.score).toBeNull();
    expect(pre.minute).toBeNull();
    const ft = buildMatchCard(match({ status: 'FINISHED', scores: { score: '3-1' } }));
    expect(ft).toMatchObject({ minute: null, score: [3, 1] });
  });
});

describe('isEntityCardStale', () => {
  const at = (msAgo: number) => new Date(NOW.getTime() - msAgo);
  const player = { type: 'PLAYER', v: ENTITY_CARD_VERSION } as GundemPlayerCard & { v: number };
  const m = (over: Partial<GundemMatchCard>) => ({ ...buildMatchCard(match()), v: ENTITY_CARD_VERSION, ...over });

  it('oyuncu/takım 6 saatte; sürüm farkı her zaman', () => {
    expect(isEntityCardStale(player, at(ENTITY_STATIC_REFRESH_MS - 1000), NOW)).toBe(false);
    expect(isEntityCardStale(player, at(ENTITY_STATIC_REFRESH_MS + 1000), NOW)).toBe(true);
    expect(isEntityCardStale({ ...player, v: 0 }, at(0), NOW)).toBe(true);
  });

  it('maç: canlı 60 sn; bitmiş asla; uzak başlamamış 6 sa; başlamasına 15 dk kala canlı aralık', () => {
    expect(isEntityCardStale(m({}), at(ENTITY_LIVE_REFRESH_MS + 1000), NOW)).toBe(true);
    expect(isEntityCardStale(m({}), at(10_000), NOW)).toBe(false);
    expect(isEntityCardStale(m({ status: 'FINISHED' }), at(30 * 24 * 3600_000), NOW)).toBe(false);
    const later = new Date(NOW.getTime() + 3 * 3600_000).toISOString();
    expect(isEntityCardStale(m({ status: 'NOT STARTED', startingAt: later }), at(2 * 3600_000), NOW)).toBe(false);
    const soon = new Date(NOW.getTime() + 10 * 60_000).toISOString();
    expect(isEntityCardStale(m({ status: 'NOT STARTED', startingAt: soon }), at(2 * 60_000), NOW)).toBe(true);
  });
});

describe('ensureEntityCard / loadEntityCards', () => {
  const team: GundemTeamCard = { type: 'TEAM', id: 34, name: 'Galatasaray', logo: null, standing: null };
  const loaders = (over: Partial<EntityLoaders> = {}): EntityLoaders => ({
    player: vi.fn(async () => null),
    team: vi.fn(async (id: number) => (id === 34 ? team : null)),
    match: vi.fn(async () => null),
    ...over,
  });

  beforeEach(() => store.clear());

  it('kayıt yoksa üretir ve kaydeder; ikinci çağrı kaynağa gitmez', async () => {
    const l = loaders();
    await expect(ensureEntityCard({ type: 'TEAM', id: 34 }, { loaders: l, now: () => NOW })).resolves.toEqual(team);
    await ensureEntityCard({ type: 'TEAM', id: 34 }, { loaders: l, now: () => NOW });
    expect(l.team).toHaveBeenCalledTimes(1);
    expect((store.get('TEAM:34')!.data as { v: number }).v).toBe(ENTITY_CARD_VERSION);
  });

  it('bulunamayan → not-found; kaynak hatası → upstream (kayıt yazılmaz)', async () => {
    await expect(ensureEntityCard({ type: 'TEAM', id: 99 }, { loaders: loaders() })).rejects.toMatchObject({ reason: 'not-found' });
    const failing = loaders({ team: vi.fn(async () => Promise.reject(new Error('429'))) });
    await expect(ensureEntityCard({ type: 'TEAM', id: 34 }, { loaders: failing })).rejects.toMatchObject({ reason: 'upstream' });
    expect(store.size).toBe(0);
  });

  it('liste: tek sorgu, kartı olmayan gönderi atlanır, kayıtsız/bozuk kayıt haritada yok', async () => {
    await ensureEntityCard({ type: 'TEAM', id: 34 }, { loaders: loaders() });
    store.set('PLAYER:5', { entityType: 'PLAYER', entityId: '5', data: { type: 'TEAM', id: 5 }, createdAt: NOW, updatedAt: NOW } as unknown as GundemEntitySnapshot);
    const cards = await loadEntityCards(
      [
        { entityType: 'TEAM', entityId: '34' },
        { entityType: null, entityId: null },
        { entityType: 'PLAYER', entityId: '5' },
        { entityType: 'MATCH', entityId: '1' },
      ],
      { loaders: loaders(), now: () => NOW },
    );
    expect([...cards.keys()]).toEqual(['TEAM:34']);
    expect(cards.get('TEAM:34')).toEqual(team); // `v` istemciye gitmez
  });

  it('eskiyen kartlar arka planda yenilenir, istek başına en çok MAX_REFRESH_PER_LIST', async () => {
    const old = new Date(NOW.getTime() - ENTITY_STATIC_REFRESH_MS - 1000);
    for (let i = 1; i <= MAX_REFRESH_PER_LIST + 2; i += 1) {
      store.set(`TEAM:${i}`, { entityType: 'TEAM', entityId: String(i), data: { ...team, id: i, v: ENTITY_CARD_VERSION }, createdAt: old, updatedAt: old } as unknown as GundemEntitySnapshot);
    }
    const teamLoader = vi.fn(async (id: number) => ({ ...team, id }));
    const refs = [...Array(MAX_REFRESH_PER_LIST + 2)].map((_, i) => ({ entityType: 'TEAM' as const, entityId: String(i + 1) }));
    const cards = await loadEntityCards(refs, { loaders: loaders({ team: teamLoader }), now: () => NOW });
    expect(cards.size).toBe(MAX_REFRESH_PER_LIST + 2); // eski hâli bu yanıtta görünür
    await vi.waitFor(() => expect(teamLoader).toHaveBeenCalledTimes(MAX_REFRESH_PER_LIST));
  });
});
