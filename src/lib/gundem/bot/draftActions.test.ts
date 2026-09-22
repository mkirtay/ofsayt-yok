import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SportmonksEventRow, SportmonksFixture } from '@/services/sportmonks/types';

vi.mock('@/lib/prisma', async () => {
  const { createFakeDb } = await import('./fakeDraftDb.testutil');
  return { prisma: createFakeDb() };
});
vi.mock('@/services/sportmonksRuntimeClient', () => ({ sportmonksClientRequest: vi.fn(), sportmonksCollectAllPages: vi.fn() }));
vi.mock('@/lib/gundem/botPost', () => ({ createBotPost: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { createBotPost } from '@/lib/gundem/botPost';
import { approveDraft, editDraftBody, rejectDraft } from './draftActions';
import type { GoalFacts } from './goalTemplates';

const db = prisma as unknown as {
  gundemBotDraft: { create: (a: { data: Record<string, unknown> }) => Promise<any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  __rows: () => any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  __reset: () => void;
};
const publish = vi.mocked(createBotPost);

const goal: SportmonksEventRow = { id: 77, fixture_id: 1, participant_id: 10, type_id: 14, player_id: 7, player_name: 'Icardi', minute: 30 };
const fx = (events: SportmonksEventRow[]): SportmonksFixture => ({
  id: 1,
  participants: [
    { id: 10, name: 'Galatasaray', meta: { location: 'home', winner: null } },
    { id: 20, name: 'Fenerbahçe', meta: { location: 'away', winner: null } },
  ],
  events,
});
const facts: GoalFacts = {
  kind: 'goal', playerName: 'Icardi', teamName: 'Galatasaray', minute: 30, extraMinute: null,
  homeName: 'Galatasaray', awayName: 'Fenerbahçe', score: { home: 1, away: 0 }, leagueName: 'Süper Lig', milestone: null,
};

async function seed() {
  return db.gundemBotDraft.create({
    data: { externalKey: 'goal:1:77', kind: 'GOAL', fixtureId: 1, eventId: 77, body: "⚽ GOL! 30' Icardi", facts, warnings: [] },
  });
}

beforeEach(() => {
  db.__reset();
  publish.mockReset();
  publish.mockResolvedValue({ status: 'created', post: { id: 'post1' } as never });
});

describe('approveDraft', () => {
  it('geçerli gol: yayınlar, POSTED + postId, takım id ve externalKey ile', async () => {
    const d = await seed();
    const r = await approveDraft(d.id, 'admin1', { fetchFixture: async () => fx([goal]) });
    expect(r.ok).toBe(true);
    expect(publish).toHaveBeenCalledWith({ body: "⚽ GOL! 30' Icardi", externalKey: 'goal:1:77', matchId: '1', teamId: 10 });
    expect(db.__rows()[0]).toMatchObject({ status: 'POSTED', postId: 'post1', decidedById: 'admin1' });
  });

  it('VAR ile iptal (olay yok): STALE, yayın çağrılmaz, 409 + neden', async () => {
    const d = await seed();
    const r = await approveDraft(d.id, 'admin1', { fetchFixture: async () => fx([]) });
    expect(r).toMatchObject({ ok: false, status: 409, reason: 'event-missing' });
    expect(publish).not.toHaveBeenCalled();
    expect(db.__rows()[0].status).toBe('STALE');
    expect(db.__rows()[0].warnings).toContain('stale: event-missing');
  });

  it('Sportmonks hatası: PENDING\'e döner (502), yayın yok', async () => {
    const d = await seed();
    const r = await approveDraft(d.id, 'admin1', { fetchFixture: async () => { throw new Error('boom'); } });
    expect(r).toMatchObject({ ok: false, status: 502 });
    expect(db.__rows()[0]).toMatchObject({ status: 'PENDING', decidedById: null });
    expect(publish).not.toHaveBeenCalled();
  });

  it('resmi hesap yoksa PENDING\'e döner', async () => {
    const d = await seed();
    publish.mockResolvedValue({ status: 'no-account', email: 'x@y.z' });
    const r = await approveDraft(d.id, 'admin1', { fetchFixture: async () => fx([goal]) });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(db.__rows()[0].status).toBe('PENDING');
  });

  it('ikinci onay (çift tık): 409, tek yayın', async () => {
    const d = await seed();
    const deps = { fetchFixture: async () => fx([goal]) };
    await approveDraft(d.id, 'admin1', deps);
    const again = await approveDraft(d.id, 'admin2', deps);
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('olmayan taslak 404', async () => {
    expect(await approveDraft('yok', 'a', { fetchFixture: async () => null })).toMatchObject({ ok: false, status: 404 });
  });
});

describe('rejectDraft / editDraftBody', () => {
  it('reddet: REJECTED; sonra düzenleme/onay 409', async () => {
    const d = await seed();
    expect((await rejectDraft(d.id, 'admin1')).ok).toBe(true);
    expect(db.__rows()[0]).toMatchObject({ status: 'REJECTED', decidedById: 'admin1' });
    expect(await editDraftBody(d.id, 'yeni')).toMatchObject({ ok: false, status: 409 });
    expect(await approveDraft(d.id, 'admin1', { fetchFixture: async () => fx([goal]) })).toMatchObject({ ok: false, status: 409 });
  });

  it('düzenleme: temizlenir, 280 sınırı ve boş metin reddedilir, yalnızca PENDING', async () => {
    const d = await seed();
    expect((await editDraftBody(d.id, '  <b>Yeni</b> metin ')).ok).toBe(true);
    expect(db.__rows()[0].body).toBe('Yeni metin');
    expect(await editDraftBody(d.id, 'x'.repeat(281))).toMatchObject({ ok: false, status: 400 });
    expect(await editDraftBody(d.id, '   ')).toMatchObject({ ok: false, status: 400 });
    expect(await editDraftBody('yok', 'metin')).toMatchObject({ ok: false, status: 404 });
  });
});
