/**
 * POST /api/admin/gundem/bot-post
 *
 * Resmi hesap (`GUNDEM_BOT_EMAIL`, varsayılan bilgi.ofsaytyok@gmail.com) adına OFFICIAL_BOT gönderisi oluşturur.
 * Erişim: `Authorization: Bearer $CRON_SECRET` ya da ADMIN oturumu (middleware + requireAdmin). Yalnızca elle tetiklenir.
 * Gövde: `{ body, externalKey?, matchId?, teamId? }`. `externalKey` idempotent: aynı anahtar tekrar gelirse hata değil
 * mevcut kayıt döner (200, `created: false`). Asıl mantık: `lib/gundem/botPost.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { optionalInt, optionalString, readJsonBody } from '@/lib/gundem/validation';
import { requireCronOrAdmin } from '@/lib/gundem/botAuth';
import { createBotPost } from '@/lib/gundem/botPost';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  try {
    if (!(await requireCronOrAdmin(req, res))) return;

    const input = readJsonBody(req);
    const externalKey = optionalString(input.externalKey, 200);
    if (input.externalKey != null && !externalKey) {
      return res.status(400).json({ error: 'Geçersiz externalKey.' });
    }

    const result = await createBotPost({
      body: typeof input.body === 'string' ? input.body : '',
      externalKey,
      matchId: optionalString(input.matchId, 64),
      teamId: optionalInt(input.teamId),
    });

    switch (result.status) {
      case 'invalid-body':
        return res.status(400).json({ error: `Gönderi 1–${POST_MAX_LENGTH} karakter olmalıdır.` });
      case 'no-account':
        return res.status(500).json({ error: `Resmi hesap bulunamadı (${result.email}). Hesap normal kayıt akışıyla oluşturulmalı.` });
      case 'exists':
        return res.status(200).json({ created: false, post: result.post });
      case 'created':
        return res.status(201).json({ created: true, post: result.post });
    }
  } catch (e) {
    captureError('gundem:bot-post', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
