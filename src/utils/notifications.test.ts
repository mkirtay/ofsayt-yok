import { describe, expect, it } from 'vitest';
import { describeNotification } from './notifications';
import type { GundemNotification } from '@/types/gundem';

// `t` taklidi: anahtar + isim
const t = (key: string, opts?: Record<string, unknown>) => (opts?.name ? `${key}:${String(opts.name)}` : key);

const base = (over: Partial<GundemNotification> = {}): GundemNotification => ({
  id: 'n1',
  type: 'POST_LIKE',
  postId: 'cpost0000000000000001',
  createdAt: '2026-09-20T12:00:00.000Z',
  readAt: null,
  actor: { id: 'u-ada', name: 'Ada', username: 'ada', image: null, official: false },
  post: { id: 'cpost0000000000000001', body: 'Merhaba dünya' },
  ...over,
});

describe('describeNotification', () => {
  it('POST_LIKE ve POST_COMMENT: metin + gönderi özeti + /gundem/{postId}', () => {
    expect(describeNotification(base(), t)).toEqual({
      text: 'notifications.postLike:Ada',
      snippet: 'Merhaba dünya',
      href: '/gundem/cpost0000000000000001',
      muted: false,
    });
    expect(describeNotification(base({ type: 'POST_COMMENT' }), t)?.text).toBe('notifications.postComment:Ada');
  });

  it('özet: boşluklar tek boşluğa iner, 60 karakterde kesilir', () => {
    const long = describeNotification(base({ post: { id: 'p', body: `a\n\n  ${'b'.repeat(100)}` } }), t);
    expect(long?.snippet).toHaveLength(60);
    expect(long?.snippet?.startsWith('a bbb')).toBe(true);
    expect(long?.snippet?.endsWith('…')).toBe(true);
  });

  it('FOLLOW: aktör profiline gider, özet yok', () => {
    expect(describeNotification(base({ type: 'FOLLOW', postId: null, post: null }), t)).toEqual({
      text: 'notifications.follow:Ada',
      snippet: null,
      href: '/gundem/kullanici/u-ada',
      muted: false,
    });
  });

  it('OFFICIAL_POST: gönderiye gider', () => {
    const v = describeNotification(base({ type: 'OFFICIAL_POST' }), t);
    expect(v).toMatchObject({ text: 'notifications.officialPost:Ada', href: '/gundem/cpost0000000000000001' });
  });

  it('isim yoksa kullanıcı adına, o da yoksa yedek metne düşer', () => {
    expect(describeNotification(base({ actor: { id: 'u', name: null, username: 'kaan', image: null, official: false } }), t)?.text).toBe('notifications.postLike:kaan');
    expect(describeNotification(base({ actor: { id: 'u', name: null, username: null, image: null, official: false } }), t)?.text).toBe('notifications.postLike:notifications.someone');
  });

  it('actor === null: "Bir kullanıcı"; FOLLOW tıklanamaz; OFFICIAL_POST için "Ofsayt Yok"', () => {
    expect(describeNotification(base({ actor: null }), t)?.text).toBe('notifications.postLike:notifications.someone');
    expect(describeNotification(base({ type: 'FOLLOW', actor: null, post: null }), t)).toMatchObject({ href: null, snippet: null });
    expect(describeNotification(base({ type: 'OFFICIAL_POST', actor: null }), t)?.text).toBe('notifications.officialPost:notifications.official');
  });

  it('silinmiş gönderi (post null): tıklanamaz, soluk, "Gönderi silindi"', () => {
    for (const type of ['POST_LIKE', 'POST_COMMENT', 'OFFICIAL_POST']) {
      expect(describeNotification(base({ type, post: null }), t)).toMatchObject({
        href: null,
        muted: true,
        snippet: 'notifications.postDeleted',
      });
    }
  });

  it('bilinmeyen type → null (çökmez, prototip anahtarları da bilinmeyen sayılır)', () => {
    expect(describeNotification(base({ type: 'SOMETHING_NEW' }), t)).toBeNull();
    expect(describeNotification(base({ type: 'toString' }), t)).toBeNull();
    expect(describeNotification(base({ type: '' }), t)).toBeNull();
  });
});
