import { afterEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@/config/brand';
import { absoluteImageUrl, siteBaseUrl, withAbsoluteImage } from './siteUrl';
import { galleryPathOf, toStoredImage } from './avatars';

const BASE = 'https://ofsaytyok.app';

describe('absoluteImageUrl (API çıkış normalizasyonu)', () => {
  it('göreli galeri yolu → base ile tam URL; mutlak URL aynen; boş → null', () => {
    expect(absoluteImageUrl('/avatars/ball.svg', BASE)).toBe('https://ofsaytyok.app/avatars/ball.svg');
    expect(absoluteImageUrl('https://cdn.x.com/a.png', BASE)).toBe('https://cdn.x.com/a.png');
    expect(absoluteImageUrl('http://x.com/a.png', BASE)).toBe('http://x.com/a.png');
    expect(absoluteImageUrl(null, BASE)).toBeNull();
    expect(absoluteImageUrl('', BASE)).toBeNull();
    expect(absoluteImageUrl(undefined, BASE)).toBeNull();
  });
  it('protokol-göreli (//host) ve düz metin dokunulmaz', () => {
    expect(absoluteImageUrl('//evil.com/x.png', BASE)).toBe('//evil.com/x.png');
  });
  it('withAbsoluteImage yalnızca image alanını değiştirir', () => {
    expect(withAbsoluteImage({ id: '1', image: '/avatars/ball.svg' })).toEqual({ id: '1', image: `${siteBaseUrl()}/avatars/ball.svg` });
    expect(withAbsoluteImage({ id: '1', image: null })).toEqual({ id: '1', image: null });
  });
});

describe('depolama formu (yazma yolu)', () => {
  it('kendi base URL\'imizdeki galeri avatarı göreli forma döner; diğerleri aynen', () => {
    expect(toStoredImage(`${BASE}/avatars/ball.svg`, BASE)).toBe('/avatars/ball.svg');
    expect(toStoredImage(`${BASE}/avatars/nope.svg`, BASE)).toBe(`${BASE}/avatars/nope.svg`);
    expect(toStoredImage('https://other.com/avatars/ball.svg', BASE)).toBe('https://other.com/avatars/ball.svg');
    expect(toStoredImage('/avatars/ball.svg', BASE)).toBe('/avatars/ball.svg');
  });
  it('galleryPathOf: göreli veya mutlak galeri avatarını tanır', () => {
    expect(galleryPathOf('/avatars/ball.svg')).toBe('/avatars/ball.svg');
    expect(galleryPathOf('http://localhost:3000/avatars/trophy.svg')).toBe('/avatars/trophy.svg');
    expect(galleryPathOf('https://x.com/photo.png')).toBeNull();
    expect(galleryPathOf('/avatars/unknown.svg')).toBeNull();
  });
});

describe('siteBaseUrl (canonical kök)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('NEXT_PUBLIC_SITE_URL yoksa marka varsayılanı; AUTH_URL / NEXTAUTH_URL canonical\'ı değiştirmez', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('AUTH_URL', 'https://www.eski-alan.example');
    vi.stubEnv('NEXTAUTH_URL', 'https://www.eski-alan.example');
    expect(siteBaseUrl()).toBe(BRAND.siteUrl);
  });

  it('NEXT_PUBLIC_SITE_URL verilirse o (sondaki "/" atılır)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000/');
    expect(siteBaseUrl()).toBe('http://localhost:3000');
  });
});
