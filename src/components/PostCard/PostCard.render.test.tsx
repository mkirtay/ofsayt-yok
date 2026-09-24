import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import PostCard from './index';
import PostComposer, { composerErrorMessage, shouldCollapseOnBlur } from '@/components/PostComposer';
import { GundemApiError } from '@/hooks/useGundem';
import type { GundemPost } from '@/types/gundem';

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const post = (over: Partial<GundemPost> = {}): GundemPost => ({
  id: 'cpost0000000000000001',
  body: 'İlk satır\nİkinci satır',
  createdAt: new Date(NOW - 5 * 60_000).toISOString(),
  authorType: 'USER',
  matchId: null,
  match: null,
  teamId: null,
  author: { id: 'u-author', name: 'Ada', username: 'ada', image: null, official: false, followedByMe: false, followerCount: 0, followingCount: 0 },
  likes: 3,
  comments: 2,
  likedByMe: false,
  ...over,
});
const noop = () => {};

describe('<PostCard />', () => {
  it('yazar, @kullanıcı, göreli zaman, gövde (satır sonu korunur) ve sayaçları basar', () => {
    const html = renderToStaticMarkup(<PostCard post={post()} onToggleLike={noop} now={NOW} />);
    expect(html).toContain('Ada');
    expect(html).toContain('@ada');
    expect(html).toContain('5 dk önce');
    expect(html).toContain('İlk satır\nİkinci satır'); // pre-wrap: \n metinde korunur
    expect(html).toContain('href="/gundem/cpost0000000000000001"');
  });

  it('avatar ve isim yazar profiline bağlanır; linkAuthor=false ile düz metin kalır', () => {
    const linked = renderToStaticMarkup(<PostCard post={post()} onToggleLike={noop} now={NOW} />);
    expect(linked.match(/href="\/gundem\/kullanici\/u-author"/g)).toHaveLength(2); // avatar + isim
    expect(linked).toMatch(/<a[^>]*aria-hidden="true"[^>]*tabindex="-1"|<a[^>]*tabindex="-1"[^>]*aria-hidden="true"/); // avatar bağlantısı yinelenen durak değil
    const plain = renderToStaticMarkup(<PostCard post={post()} linkAuthor={false} onToggleLike={noop} now={NOW} />);
    expect(plain).not.toContain('/gundem/kullanici/');
    expect(plain).toContain('Ada');
  });

  it('gövde HTML olarak yorumlanmaz (XSS): etiketler kaçırılır', () => {
    const html = renderToStaticMarkup(<PostCard post={post({ body: '<img src=x onerror=alert(1)>' })} onToggleLike={noop} now={NOW} />);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('oturum yokken beğeni pasif ve silme yok', () => {
    const html = renderToStaticMarkup(<PostCard post={post()} onToggleLike={noop} onDelete={noop} now={NOW} />);
    expect(html).toMatch(/aria-pressed="false"[^>]*disabled|disabled[^>]*aria-pressed="false"/);
    expect(html).not.toContain('Gönderiyi sil');
  });

  it('silme yalnızca sahip veya ADMIN için görünür', () => {
    const owner = renderToStaticMarkup(<PostCard post={post()} currentUserId="u-author" onToggleLike={noop} onDelete={noop} now={NOW} />);
    const stranger = renderToStaticMarkup(<PostCard post={post()} currentUserId="u-other" onToggleLike={noop} onDelete={noop} now={NOW} />);
    const admin = renderToStaticMarkup(<PostCard post={post()} currentUserId="u-other" isAdmin onToggleLike={noop} onDelete={noop} now={NOW} />);
    expect(owner).toContain('aria-label="Gönderiyi sil"');
    expect(stranger).not.toContain('Gönderiyi sil');
    expect(admin).toContain('aria-label="Gönderiyi sil"');
  });

  it('resmi hesap için doğrulama rozeti gösterir', () => {
    const bot = renderToStaticMarkup(<PostCard post={post({ authorType: 'OFFICIAL_BOT' })} onToggleLike={noop} now={NOW} />);
    const user = renderToStaticMarkup(<PostCard post={post()} onToggleLike={noop} now={NOW} />);
    const allowlisted = renderToStaticMarkup(
      <PostCard post={post({ author: { ...post().author, official: true } })} onToggleLike={noop} now={NOW} />,
    );
    expect(bot).toContain('Resmi hesap');
    expect(allowlisted).toContain('Resmi hesap'); // USER post'u ama allowlist'teki hesap
    expect(user).not.toContain('Resmi hesap');
  });

  it('beğenilmiş post aria-pressed=true', () => {
    const html = renderToStaticMarkup(<PostCard post={post({ likedByMe: true })} currentUserId="u1" onToggleLike={noop} now={NOW} />);
    expect(html).toContain('aria-pressed="true"');
  });
});

describe('<PostComposer />', () => {
  const props = { variant: 'post' as const, onSubmit: async () => {} };

  it('oturum yokken form yerine giriş bağlantısı', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated={false} maxLength={280} />);
    expect(html).toContain('href="/auth/signin"');
    expect(html).not.toContain('<textarea');
  });

  it('textarea maxLength ve kalan karakter sayacı (boşken 280, uyarı yok)', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated maxLength={280} />);
    expect(html).toContain('maxLength="280"');
    expect(html).toContain('>280<');
    expect(html).not.toContain('counterWarn');
  });

  it('kalan ≤ 20 ise sayaç uyarı sınıfı alır', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated maxLength={10} />);
    expect(html).toContain('counterWarn');
  });

  it('boşken gönder düğmesi pasif', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated maxLength={280} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Paylaş<|<button[^>]*>Paylaş<\/button>/);
    expect(html).toContain('disabled');
  });
});

describe('<PostComposer variant="post-inline" />', () => {
  const props = { variant: 'post-inline' as const, onSubmit: async () => {}, maxLength: 280 };

  it('kapalıyken tek satır: inline placeholder, rows=1, sayaç/gönder düğmesi yok', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated />);
    expect(html).toContain('Ne düşünüyorsun?');
    expect(html).toContain('rows="1"');
    expect(html).toContain('data-expanded="false"');
    expect(html).toContain('collapsed');
    expect(html).not.toContain('>280<');
    expect(html).not.toContain('Paylaş');
  });

  it('autoFocus ile açık başlar: rows=3, sayaç ve gönder düğmesi görünür (mevcut composer)', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated autoFocus />);
    expect(html).toContain('rows="3"');
    expect(html).toContain('data-expanded="true"');
    expect(html).toContain('>280<');
    expect(html).toContain('Paylaş');
    expect(html).not.toContain('collapsed');
  });

  it('oturum yokken aynı /auth/signin bağlantısı, tek satır (loginInline) görünümde', () => {
    const html = renderToStaticMarkup(<PostComposer {...props} authenticated={false} />);
    expect(html).toContain('href="/auth/signin"');
    expect(html).toContain('loginInline');
    expect(html).not.toContain('<textarea');
  });

  it("'post' varyantı değişmedi: her zaman açık (rows=3, sayaç), data-expanded yok", () => {
    const html = renderToStaticMarkup(<PostComposer {...props} variant="post" authenticated />);
    expect(html).toContain('rows="3"');
    expect(html).toContain('>280<');
    expect(html).not.toContain('data-expanded');
  });
});

describe('shouldCollapseOnBlur', () => {
  it('boş + odak dışarı çıktı → küçül', () => {
    expect(shouldCollapseOnBlur('', false)).toBe(true);
    expect(shouldCollapseOnBlur('  \n ', false)).toBe(true);
  });
  it('metin varsa açık kalır (yazılan kaybolmaz)', () => {
    expect(shouldCollapseOnBlur('merhaba', false)).toBe(false);
  });
  it('odak composer içinde kalıyorsa (ör. Paylaş düğmesi) küçülmez', () => {
    expect(shouldCollapseOnBlur('', true)).toBe(false);
  });
});

describe('composerErrorMessage', () => {
  const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${JSON.stringify(opts)}` : key);
  it('429 + Retry-After → saniyeli mesaj; Retry-After yoksa genel bekleme mesajı', () => {
    expect(composerErrorMessage(new GundemApiError('x', 429, 42), t)).toBe('composer.rateLimited:{"seconds":42}');
    expect(composerErrorMessage(new GundemApiError('x', 429, null), t)).toBe('composer.rateLimitedNoWait');
  });
  it('bağlantı hatası, 401 ve sunucunun Türkçe mesajı', () => {
    expect(composerErrorMessage(new GundemApiError('network', 0), t)).toBe('composer.connectionError');
    expect(composerErrorMessage(new GundemApiError('x', 401), t)).toBe('composer.loginPrompt');
    expect(composerErrorMessage(new GundemApiError('Gönderi 1–280 karakter olmalıdır.', 400), t)).toBe('Gönderi 1–280 karakter olmalıdır.');
  });
  it('bilinmeyen hata → genel mesaj', () => {
    expect(composerErrorMessage(new Error('boom'), t)).toBe('composer.error');
    expect(composerErrorMessage(new GundemApiError('error', 500), t)).toBe('composer.error');
  });
});
