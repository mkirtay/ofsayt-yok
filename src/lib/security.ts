import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

type TurnstileResponse = {
  success: boolean;
};

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return false;
  }

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (remoteIp) body.set('remoteip', remoteIp);

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) return false;

  const data = (await response.json()) as TurnstileResponse;
  return data.success === true;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  );
}

async function sendViaResend(to: string, link: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Ofsayt Yok - E-posta Dogrulama',
      html: `<p>Merhaba,</p><p>Hesabinizi aktif etmek icin asagidaki baglantiya tiklayin:</p><p><a href="${link}">${link}</a></p><p>Bu baglanti 24 saat gecerlidir.</p>`,
    }),
  });

  return response.ok;
}

export async function createAndSendEmailVerification(email: string): Promise<void> {
  const rawToken = randomBytes(32).toString('hex');
  const hashedToken = sha256(rawToken);
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: hashedToken,
      expires,
    },
  });

  const link = `${appBaseUrl()}/api/auth/verify-email?token=${rawToken}`;
  const sent = await sendViaResend(email, link);

  if (!sent) {
    console.warn('[verify-email] Email provider not configured or failed. Link:', link);
  }
}

export async function consumeEmailVerificationToken(rawToken: string): Promise<boolean> {
  const hashedToken = sha256(rawToken);
  const tokenRow = await prisma.verificationToken.findUnique({
    where: { token: hashedToken },
  });

  if (!tokenRow) return false;
  if (tokenRow.expires <= new Date()) {
    await prisma.verificationToken.delete({ where: { token: hashedToken } });
    return false;
  }

  await prisma.user.update({
    where: { email: tokenRow.identifier },
    data: { emailVerified: new Date() },
  });

  await prisma.verificationToken.delete({ where: { token: hashedToken } });
  return true;
}

export function sanitizePlainText(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
}

export function isSafeHttpUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
