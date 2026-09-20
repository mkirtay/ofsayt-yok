/**
 * POST /api/admin/gundem/bot-post
 *
 * Resmi "Ofsayt Yok" hesabı adına OFFICIAL_BOT gönderisi oluşturur. Erişim: `Authorization: Bearer $CRON_SECRET`
 * ya da ADMIN oturumu (middleware + requireAdmin). Gövde: `{ body, externalKey?, matchId?, teamId? }`.
 * `externalKey` idempotent: aynı anahtar tekrar gelirse hata değil mevcut kayıt döner (200, `created: false`).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { captureError } from '@/lib/logger';
import { requireAdmin } from '@/lib/requireAuth';
import { OFFICIAL_ACCOUNT_EMAIL } from '@/lib/gundem/official';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { optionalInt, optionalString, readJsonBody } from '@/lib/gundem/validation';
import { postSelect, serializePost } from '@/lib/gundem/posts';

function isValidCronRequest(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    if (!isValidCronRequest(req)) {
      const guard = await requireAdmin(req, res);
      if (!guard.ok) return;
    }

    const input = readJsonBody(req);
    const body = sanitizePlainText(typeof input.body === 'string' ? input.body : '', { allowNewlines: true });
    if (!body || body.length > POST_MAX_LENGTH) {
      return res.status(400).json({ error: `Gönderi 1–${POST_MAX_LENGTH} karakter olmalıdır.` });
    }
    const externalKey = optionalString(input.externalKey, 200);
    if (input.externalKey != null && !externalKey) {
      return res.status(400).json({ error: 'Geçersiz externalKey.' });
    }

    const select = postSelect(null);
    if (externalKey) {
      const existing = await prisma.post.findUnique({ where: { externalKey }, select });
      if (existing) return res.status(200).json({ created: false, post: serializePost(existing) });
    }

    const official = await prisma.user.findUnique({ where: { email: OFFICIAL_ACCOUNT_EMAIL }, select: { id: true } });
    if (!official) {
      return res.status(500).json({ error: 'Resmi hesap bulunamadı (npm run seed-official).' });
    }

    try {
      const created = await prisma.post.create({
        data: {
          authorId: official.id,
          authorType: 'OFFICIAL_BOT',
          body,
          externalKey,
          matchId: optionalString(input.matchId, 64),
          teamId: optionalInt(input.teamId),
        },
        select,
      });
      return res.status(201).json({ created: true, post: serializePost(created) });
    } catch (e) {
      // Yarış: aynı externalKey eşzamanlı yazıldıysa unique ihlali → mevcut kaydı döndür.
      if (externalKey && (e as { code?: string }).code === 'P2002') {
        const existing = await prisma.post.findUnique({ where: { externalKey }, select });
        if (existing) return res.status(200).json({ created: false, post: serializePost(existing) });
      }
      throw e;
    }
  } catch (e) {
    captureError('gundem:bot-post', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
