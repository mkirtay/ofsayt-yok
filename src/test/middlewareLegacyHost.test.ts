/**
 * Eski alan adı kapatıldı: ofsaytyok.app / www.ofsaytyok.app sayfaları 410 + "kapatıldı" sayfası; /api, /_next,
 * /.well-known ve uzantılı dosyalar açık; diğer host'larda middleware bu girdi için hiç çalışmaz (matcher `has: host`).
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';

vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => null) }));

import { config, isClosedLegacyRequest, middleware } from '@/middleware';

const req = (host: string, path: string) =>
  new NextRequest(`https://${host}${path}`, { headers: { host } });

const DATE = '2026-10-13';
const LEGACY = ['ofsaytyok.app', 'www.ofsaytyok.app'];
const OTHER = ['www.getscor3.com', 'getscor3.com', 'ofsayt-yok.vercel.app', 'ofsayt-yok-git-x-mkirtays-projects.vercel.app', 'localhost:3000'];

describe('eski alan adı: 410 Gone', () => {
  it.each(LEGACY.flatMap((h) => ['/', '/credits', '/matches/19722146-liverpool-manchester-city', '/auth/signin', '/profile', '/admin/kullanicilar'].map((p) => [h, p])))(
    '%s%s → 410, kapalı sayfası, noindex + no-store, yönlendirme yok',
    async (host, path) => {
      const res = await middleware(req(host, path));
      expect(res.status).toBe(410);
      expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
      expect(res.headers.get('x-robots-tag')).toBe('noindex');
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('location')).toBeNull();
      const html = await res.text();
      expect(html).toContain('Bu adres kapatıldı.');
      expect(html).not.toMatch(/scor3|ofsayt/i); // marka adı yok
      expect(html).not.toMatch(/<a\b|http-equiv=["']?refresh|location\.|<script/i);
    },
  );

  it.each(
    LEGACY.flatMap((h) =>
      [`/api/matches/day?date=${DATE}`, '/api/auth/session', '/_next/static/chunks/x.js', '/_next/data/abc/index.json', '/.well-known/security.txt', '/robots.txt', '/sitemap.xml', '/favicon.ico', '/avatars/ball.svg', '/images/og-default-v3.png'].map((p) => [h, p]),
    ),
  )('%s%s → kapatılmaz', (host, path) => {
    expect(isClosedLegacyRequest(req(host, path))).toBe(false);
  });

  it.each(OTHER.flatMap((h) => ['/', '/credits'].map((p) => [h, p])))('%s%s → kapatılmaz (diğer host)', async (host, path) => {
    expect(isClosedLegacyRequest(req(host, path))).toBe(false);
    const res = await middleware(req(host, path));
    expect(res.status).not.toBe(410);
  });

  it('eski host\'ta /api/admin koruması sürer (401, 410 değil)', async () => {
    const res = await middleware(req('www.ofsaytyok.app', '/api/admin/users'));
    expect(res.status).toBe(401);
  });
});

describe('matcher: middleware yalnız eski host\'ta (+ mevcut korumalı yollarda) çalışır', () => {
  const matches = (host: string, path: string) =>
    unstable_doesMiddlewareMatch({ config, url: `https://${host}${path}`, headers: { host } });

  it.each(LEGACY.flatMap((h) => ['/', '/credits', '/robots.txt'].map((p) => [h, p])))('%s%s → eşleşir', (host, path) => {
    expect(matches(host, path)).toBe(true);
  });

  it.each(LEGACY.flatMap((h) => [`/api/matches/day`, '/_next/static/x.js', '/.well-known/x'].map((p) => [h, p])))('%s%s → eşleşmez', (host, path) => {
    expect(matches(host, path)).toBe(false);
  });

  it.each(OTHER.flatMap((h) => ['/', '/credits', '/matches/1-a-b'].map((p) => [h, p])))('%s%s → eşleşmez (diğer host, middleware hiç çalışmaz)', (host, path) => {
    expect(matches(host, path)).toBe(false);
  });

  it('mevcut korumalı yollar her host\'ta eşleşmeye devam eder', () => {
    for (const host of ['www.getscor3.com', 'ofsayt-yok.vercel.app']) {
      expect(matches(host, '/profile')).toBe(true);
      expect(matches(host, '/api/admin/users')).toBe(true);
      expect(matches(host, '/admin/kullanicilar')).toBe(true);
    }
  });
});
