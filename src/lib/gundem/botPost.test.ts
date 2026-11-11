import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    matchSnapshot: { findMany: vi.fn(async () => []) },
    user: {
      findUnique: vi.fn(async () => ({ id: 'bot-user' })),
      create: vi.fn(async () => ({ id: 'role-user' })),
    },
    post: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'p1',
        body: data.body,
        createdAt: new Date('2026-09-25T00:00:00Z'),
        authorType: data.authorType,
        matchId: data.matchId,
        teamId: data.teamId,
        author: {
          id: 'bot-user',
          name: 'Ofsayt Yok',
          username: null,
          image: null,
          email: 'bot@example.invalid',
          _count: { followers: 0, following: 0 },
          followers: false,
        },
        _count: { likes: 0, comments: 0 },
        likes: false,
      })),
    },
  },
}));
vi.mock('@/lib/logger', () => ({ captureError: vi.fn() }));
vi.mock('@/lib/gundem/official', () => ({
  getBotAccountEmail: () => 'bot@example.invalid',
  isOfficialUser: () => true,
  BOT_ROLE_IMAGE: '/brand/icon-192.png',
  BOT_ROLE_ACCOUNTS: { RECAP: { email: 'recap@example.invalid', username: 'r', name: 'R' } },
}));
vi.mock('@/lib/gundem/matchSnapshot', () => ({ ensureMatchSnapshot: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { createBotPost } from './botPost';

const ensure = vi.mocked(ensureMatchSnapshot);

beforeEach(() => {
  ensure.mockReset();
  vi.mocked(prisma.post.create).mockClear();
  vi.mocked(captureError).mockClear();
});

describe('createBotPost — maç snapshot\'ı', () => {
  it('matchId varsa snapshot garanti edilir ve post matchId ile yazılır', async () => {
    ensure.mockResolvedValue({} as never);
    const r = await createBotPost({ body: 'GOL!', matchId: '19134567', externalKey: 'goal:1:2' });
    expect(ensure).toHaveBeenCalledWith('19134567');
    expect(r.status).toBe('created');
    expect(vi.mocked(prisma.post.create).mock.calls[0][0].data).toMatchObject({ matchId: '19134567', authorType: 'OFFICIAL_BOT' });
  });

  it('snapshot çözülemezse post yine yazılır (hata loglanır)', async () => {
    ensure.mockRejectedValue(new Error('sağlayıcı kapalı'));
    const r = await createBotPost({ body: 'GOL!', matchId: '19134567' });
    expect(r.status).toBe('created');
    expect(captureError).toHaveBeenCalledWith('gundem:bot-post-snapshot', expect.any(Error));
  });

  it('matchId yoksa snapshot çağrılmaz', async () => {
    await createBotPost({ body: 'Duyuru' });
    expect(ensure).not.toHaveBeenCalled();
  });
});

describe('createBotPost — rol hesabı', () => {
  it('rol hesabı varsa onunla yazar; yoksa oluşturur', async () => {
    const find = vi.mocked(prisma.user.findUnique);
    find.mockResolvedValueOnce({ id: 'recap-user' } as never);
    await createBotPost({ body: 'Maç sonu', role: 'RECAP' });
    expect(vi.mocked(prisma.post.create).mock.calls.at(-1)![0].data).toMatchObject({ authorId: 'recap-user' });

    find.mockResolvedValueOnce(null);
    await createBotPost({ body: 'Maç sonu', role: 'RECAP' });
    expect(vi.mocked(prisma.user.create).mock.calls.at(-1)![0].data).toMatchObject({ email: 'recap@example.invalid', emailVerified: expect.any(Date) });
    expect(vi.mocked(prisma.post.create).mock.calls.at(-1)![0].data).toMatchObject({ authorId: 'role-user' });
  });

  it('rol hesabı oluşturulamazsa ana bot hesabına düşer', async () => {
    const find = vi.mocked(prisma.user.findUnique);
    find.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'bot-user' } as never);
    vi.mocked(prisma.user.create).mockRejectedValueOnce(new Error('kullanıcı adı alınmış'));
    const r = await createBotPost({ body: 'Maç sonu', role: 'RECAP' });
    expect(r.status).toBe('created');
    expect(vi.mocked(prisma.post.create).mock.calls.at(-1)![0].data).toMatchObject({ authorId: 'bot-user' });
  });
});
