/**
 * /api/gundem/pin — Gündem 1. sıra teklifi (kurallar: lib/pinBid.ts).
 *
 * GET (herkese açık, `private, no-store`; IP hız sınırı): bu haftanın lideri, en düşük geçerli teklif, sıfırlama zamanı.
 * POST `{ amount, message }` (giriş + Kullanım Şartları onayı + kullanıcı adı + Gündem yazma izni): 140 karakterlik mesaj,
 *   bağlantı yasak, Gündem içerik filtresi. 201 `{ state, credits }`; 409 BID_TOO_LOW (`minBid`) / ALREADY_LEADER,
 *   402 INSUFFICIENT_CREDITS. Geçilen lidere aktörsüz PIN_OUTBID bildirimi.
 * DELETE `?id=` (yalnız ADMIN): aktif mesajı kaldırır, başlayan gün oranında iade, PIN_REMOVED bildirimi.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { requireAdmin } from '@/lib/requireAuth';
import { requireTermsConsent } from '@/lib/termsConsentGate';
import {
  GUNDEM_SUSPENDED_CODE,
  USERNAME_REQUIRED_CODE,
  USERNAME_REQUIRED_MESSAGE,
  loadGundemAuthor,
  suspendedMessage,
} from '@/lib/gundem/authorGate';
import { loadPinState } from '@/lib/gundem/pinState';
import { readJsonBody } from '@/lib/gundem/validation';
import { moderateGundemText } from '@/lib/moderation/contentGate';
import { countLinks } from '@/lib/moderation/textFilter';
import {
  InsufficientCreditsError,
  PIN_MAX_BID,
  PIN_MESSAGE_MAX_LENGTH,
  PinBidError,
  placePinBid,
  removePinBid,
} from '@/lib/pinBid';

export const config = { api: { bodyParser: { sizeLimit: '4kb' } } };

const RAW_MESSAGE_MAX_LENGTH = PIN_MESSAGE_MAX_LENGTH * 4;

async function notifyPin(userId: string, type: 'PIN_OUTBID' | 'PIN_REMOVED') {
  try {
    await prisma.notification.create({ data: { userId, actorId: null, type } });
  } catch (e) {
    captureError('gundem:pin-notify', e);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'GET') {
      const rl = await hitFixedWindowRateLimit(
        `gundem-pin:ip:${requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress)}`,
        60,
        60_000,
      );
      if (!rl.success) return res.status(429).json({ error: 'Çok fazla istek.' });
      const viewerId = await getRequestUserId(req, res);
      return res.status(200).json(await loadPinState(viewerId));
    }

    if (req.method === 'POST') {
      const userId = await getRequestUserId(req, res);
      if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
      const rl = await hitFixedWindowRateLimit(`gundem-pin:user:${userId}`, 5, 60_000);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla teklif verdiniz. Biraz bekleyin.' });
      }
      if (!(await requireTermsConsent(req, res, userId))) return;

      const input = readJsonBody(req);
      const amount = typeof input.amount === 'number' ? input.amount : Number.NaN;
      if (!Number.isInteger(amount) || amount < 1 || amount > PIN_MAX_BID) {
        return res.status(400).json({ error: `Teklif 1–${PIN_MAX_BID} arasında tam sayı olmalıdır.` });
      }
      const raw = typeof input.message === 'string' ? input.message : '';
      if (raw.length > RAW_MESSAGE_MAX_LENGTH) {
        return res.status(400).json({ error: `Mesaj 1–${PIN_MESSAGE_MAX_LENGTH} karakter olmalıdır.` });
      }
      const message = sanitizePlainText(raw, { allowNewlines: false, maxInputLength: RAW_MESSAGE_MAX_LENGTH });
      if (!message || message.length > PIN_MESSAGE_MAX_LENGTH) {
        return res.status(400).json({ error: `Mesaj 1–${PIN_MESSAGE_MAX_LENGTH} karakter olmalıdır.` });
      }
      if (countLinks(message) > 0) return res.status(400).json({ error: '1. sıra mesajında bağlantı paylaşılamaz.', code: 'LINK_NOT_ALLOWED' });

      const author = await loadGundemAuthor(userId);
      if (author.status === 'missing') return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
      if (author.status === 'needsUsername') return res.status(403).json({ error: USERNAME_REQUIRED_MESSAGE, code: USERNAME_REQUIRED_CODE });
      if (author.status === 'suspended') {
        return res.status(403).json({ error: suspendedMessage(author.until), code: GUNDEM_SUSPENDED_CODE, suspendedUntil: author.until.toISOString() });
      }
      const gate = await moderateGundemText({ userId, body: message, surface: 'post', accountCreatedAt: author.createdAt });
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error, code: gate.code });

      try {
        const result = await placePinBid({ userId, amount, message });
        if (result.previous) await notifyPin(result.previous.userId, 'PIN_OUTBID');
        return res.status(201).json({ state: await loadPinState(userId), credits: result.balance });
      } catch (e) {
        if (e instanceof PinBidError && e.code === 'BID_TOO_LOW') {
          return res.status(409).json({ error: `Teklif en az ${e.minBid} kredi olmalı.`, code: e.code, minBid: e.minBid });
        }
        if (e instanceof PinBidError && e.code === 'ALREADY_LEADER') {
          return res.status(409).json({ error: '1. sıra zaten sende.', code: e.code });
        }
        if (e instanceof InsufficientCreditsError) {
          return res.status(402).json({ error: 'Krediniz yetersiz.', code: 'INSUFFICIENT_CREDITS' });
        }
        throw e;
      }
    }

    if (req.method === 'DELETE') {
      const auth = await requireAdmin(req, res);
      if (!auth.ok) return;
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      try {
        const out = await removePinBid(id);
        await notifyPin(out.userId, 'PIN_REMOVED');
        return res.status(200).json({ state: await loadPinState(auth.userId), refunded: out.refunded });
      } catch (e) {
        if (e instanceof PinBidError) return res.status(404).json({ error: 'Aktif 1. sıra mesajı bulunamadı.', code: e.code });
        throw e;
      }
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:pin', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
