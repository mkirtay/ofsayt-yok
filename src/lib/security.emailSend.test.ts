/** Resend'e giden istek: gönderen env'den (EMAIL_FROM), yanıt adresi iletişim kutusu (BRAND.contactEmail). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: { verificationToken: { deleteMany: vi.fn(), create: vi.fn() } },
}));
vi.mock('@/lib/credits', () => ({ grantVerifiedSignupBonus: vi.fn() }));

import {
  createAndSendEmailVerification,
  createAndSendPasswordReset,
  EMAIL_REPLY_TO,
  passwordResetEmail,
  verificationEmail,
} from './security';
import { BRAND } from '@/config/brand';

type Sent = { url: string; headers: Record<string, string>; raw: string; body: Record<string, unknown> };

function captureResend(): Sent[] {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    sent.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, raw: String(init?.body), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
  });
  return sent;
}

describe('Resend gönderimi', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = `${BRAND.name} <noreply@example.test>`;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.restoreAllMocks();
  });

  it('yanıt adresi info@getscor3.com (BRAND.contactEmail)', () => {
    expect(EMAIL_REPLY_TO).toBe('info@getscor3.com');
    expect(EMAIL_REPLY_TO).toBe(BRAND.contactEmail);
  });

  it.each([
    ['doğrulama', createAndSendEmailVerification],
    ['şifre sıfırlama', createAndSendPasswordReset],
  ])('%s: from env\'den, reply_to iletişim kutusu, alıcı aynı', async (_n, fn) => {
    const sent = captureResend();
    await fn('kisi@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://api.resend.com/emails');
    expect(sent[0]!.body).toMatchObject({ from: process.env.EMAIL_FROM, to: 'kisi@example.com', reply_to: EMAIL_REPLY_TO });
  });
});

/** ASCII'ye indirgenmiş eski yazımlar (Türkçe karakter düzeltmesi geri gitmesin). */
const ASCII_ONLY = /\b(Dogrulama|Sifre|Sifirlama|Hesabinizi|Sifrenizi|sifirlamak|icin|asagidaki|baglanti|baglantiya|tiklayin|gecerlidir|istegi|yapmadiysa|e-postayi)\b/;

describe('e-posta metinleri (Türkçe karakterler)', () => {
  const LINK = 'https://www.getscor3.com/x?token=abc';

  it.each([
    ['doğrulama', verificationEmail(LINK), `${BRAND.name} - E-posta Doğrulama`, ['Merhaba,', 'Hesabınızı aktif etmek için aşağıdaki bağlantıya tıklayın:', 'Bu bağlantı 24 saat geçerlidir.']],
    ['şifre sıfırlama', passwordResetEmail(LINK), `${BRAND.name} - Şifre Sıfırlama`, ['Merhaba,', 'Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:', 'geçerlidir.', 'Bu isteği siz yapmadıysanız bu e-postayı yoksayabilirsiniz.']],
  ] as const)('%s: konu ve gövde Türkçe, marka BRAND.name, HTML UTF-8, düz metin alternatifi', (_n, mail, subject, phrases) => {
    expect(mail.subject).toBe(subject);
    for (const p of phrases) {
      expect(mail.html).toContain(p);
      expect(mail.text).toContain(p.replace(/<\/?strong>/g, ''));
    }
    for (const part of [mail.subject, mail.html, mail.text]) expect(part).not.toMatch(ASCII_ONLY);
    expect(mail.html).toMatch(/^<!doctype html><html lang="tr"><head><meta charset="utf-8">/);
    expect(mail.html).toContain(`<a href="${LINK}">${LINK}</a>`);
    expect(mail.text).toContain(LINK);
    expect(mail.text).not.toMatch(/<[a-z]/i);
  });
});

describe('Resend isteğinin kodlaması', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = `${BRAND.name} <noreply@example.test>`;
  });
  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    vi.restoreAllMocks();
  });

  it('JSON UTF-8: Türkçe karakterler kaçışsız ve UTF-8 baytlarıyla gider; html + text birlikte', async () => {
    const sent = captureResend();
    await createAndSendPasswordReset('kisi@example.com');
    const req = sent[0]!;
    expect(req.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(req.body.subject).toBe(`${BRAND.name} - Şifre Sıfırlama`);
    expect(typeof req.body.html).toBe('string');
    expect(typeof req.body.text).toBe('string');
    // JSON.stringify ASCII dışını \uXXXX'e çevirmez; fetch gövdeyi UTF-8 kodlar → "ş" iki bayt (c5 9f).
    expect(req.raw).toContain('Şifre Sıfırlama');
    expect(req.raw).not.toMatch(/\\u015[eEfF]/);
    expect(Buffer.from(req.raw, 'utf8').includes(Buffer.from([0xc5, 0x9f]))).toBe(true);
  });
});
