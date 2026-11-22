import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/security', () => ({
  emailHtml: (b: string) => `<html>${b}</html>`,
  sendTransactionalEmail: async () => true,
}));

import { buildDigestEmail, digestEnabled, pickDigestMatches, runWeeklyDigest, unsubscribeSignature, verifyUnsubscribe } from './weeklyDigest';
import { findGamblingTerms } from '@/utils/gamblingTerms';

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret';
});
afterEach(() => {
  delete process.env.EMAIL_DIGEST_ENABLED;
});

describe('haftalık e-posta özeti (büyüme raporu 3.3)', () => {
  it('varsayılan kapalı; kapalıyken DB\'ye gitmez', async () => {
    expect(digestEnabled()).toBe(false);
    expect(await runWeeklyDigest()).toEqual({ skipped: 'disabled' });
  });

  it('abonelikten çıkma imzası kullanıcıya bağlı', () => {
    const s = unsubscribeSignature('u1');
    expect(verifyUnsubscribe('u1', s)).toBe(true);
    expect(verifyUnsubscribe('u2', s)).toBe(false);
    expect(verifyUnsubscribe('u1', 'x')).toBe(false);
  });

  it('yalnız favori takımların maçları; e-postada çıkış bağlantısı, 18+ notu, bahis dili yok', () => {
    const fixtures = [
      { id: 1, home: { id: 34, name: 'Galatasaray' }, away: { id: 88, name: 'Fenerbahçe' }, date: '2026-11-29', scheduled: '20:00' },
      { id: 2, home: { id: 5, name: 'X' }, away: { id: 6, name: 'Y' }, date: '2026-11-29', scheduled: '17:00' },
    ] as never;
    const matches = pickDigestMatches(fixtures, new Set([34]));
    expect(matches.map((m) => m.title)).toEqual(['Galatasaray - Fenerbahçe']);
    const mail = buildDigestEmail({ name: 'Ayşe', matches, proof: { hits: 40, picks: 51, days: 7 }, unsubscribe: 'https://x/unsub' });
    expect(mail.html).toContain('Abonelikten çık');
    expect(mail.text).toContain('https://x/unsub');
    expect(mail.text).toContain('18+');
    expect(mail.text).toContain('51 AI tahmininden 40 tanesi tuttu');
    expect(findGamblingTerms(mail.text)).toEqual([]);
  });
});
