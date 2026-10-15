import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import {
  GUNDEM_SUSPENDED_CODE,
  USERNAME_REQUIRED_CODE,
  USERNAME_REQUIRED_MESSAGE,
  loadGundemAuthor,
  suspendedMessage,
} from '@/lib/gundem/authorGate';
import { commentVisibilityWhere, postVisibilityWhere } from '@/lib/gundem/visibility';
import { notifyMentions, resolveMentions, saveMentions } from '@/lib/gundem/mentions';
import { moderateGundemText } from '@/lib/moderation/contentGate';
import { fileAutoFlags } from '@/lib/moderation/reports';
import { requireTermsConsent } from '@/lib/termsConsentGate';
import { COMMENT_MAX_LENGTH } from '@/config/gundem';
import { PAGE_SIZE, queryString, readJsonBody } from '@/lib/gundem/validation';
import { commentSelect, paginate, serializeComment } from '@/lib/gundem/posts';
import { createNotification } from '@/lib/gundem/notify';

// Gönderi/yorum gövdesi ~280 karakter; Next varsayılanı (1 MB) yerine 16 KB — aşılırsa Next 413 döner.
export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };
/** Temizlenmemiş gövde için tavan (içerik sınırı 280; etiket/boşluk payı). Aşan istek temizlenmeden 400 alır. */
const RAW_BODY_MAX_LENGTH = 2000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const postId = queryString(req.query.postId);
  if (!postId) return res.status(400).json({ error: 'Geçersiz gönderi kimliği.' });

  try {
    if (req.method === 'GET') {
      const viewerId = await getRequestUserId(req, res);
      const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null, AND: [postVisibilityWhere(viewerId)] },
        select: { id: true },
      });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

      const cursor = queryString(req.query.cursor);
      const rows = await prisma.postComment.findMany({
        where: { postId, deletedAt: null, AND: [commentVisibilityWhere(viewerId)] },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: commentSelect,
      });
      const { items, nextCursor } = paginate(rows, PAGE_SIZE);
      return res.json({ items: items.map((c) => serializeComment(c, viewerId)), nextCursor });
    }

    if (req.method === 'POST') {
      const userId = await getRequestUserId(req, res);
      if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

      const rl = await hitFixedWindowRateLimit(`gundem-comment:user:${userId}`, 5, 60_000);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla yorum gönderdiniz. Biraz bekleyin.' });
      }
      // Kullanım Şartları onayı yoksa 403 TERMS_REQUIRED (web; mobil Bearer muaf — lib/termsConsentGate.ts).
      if (!(await requireTermsConsent(req, res, userId))) return;

      const input = readJsonBody(req);
      const rawBody = typeof input.body === 'string' ? input.body : '';
      // Ham uzunluk temizlemeden ÖNCE: büyük gövde CPU harcatmadan reddedilir.
      if (rawBody.length > RAW_BODY_MAX_LENGTH) {
        return res.status(400).json({ error: `Yorum 1–${COMMENT_MAX_LENGTH} karakter olmalıdır.` });
      }
      const body = sanitizePlainText(rawBody, { allowNewlines: true, maxInputLength: RAW_BODY_MAX_LENGTH });
      if (!body || body.length > COMMENT_MAX_LENGTH) {
        return res.status(400).json({ error: `Yorum 1–${COMMENT_MAX_LENGTH} karakter olmalıdır.` });
      }

      const post = await prisma.post.findFirst({
        where: { id: postId, deletedAt: null },
        select: { id: true, authorId: true },
      });
      if (!post) return res.status(404).json({ error: 'Gönderi bulunamadı.' });

      const author = await loadGundemAuthor(userId);
      if (author.status === 'missing') return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });
      if (author.status === 'needsUsername') {
        return res.status(403).json({ error: USERNAME_REQUIRED_MESSAGE, code: USERNAME_REQUIRED_CODE });
      }
      if (author.status === 'suspended') {
        return res
          .status(403)
          .json({ error: suspendedMessage(author.until), code: GUNDEM_SUSPENDED_CODE, suspendedUntil: author.until.toISOString() });
      }
      const gate = await moderateGundemText({ userId, body, surface: 'comment', postId, accountCreatedAt: author.createdAt });
      if (!gate.ok) return res.status(gate.status).json({ error: gate.error, code: gate.code });

      const created = await prisma.postComment.create({ data: { postId, userId, body }, select: { id: true } });
      // Gönderi sahibine yorum bildirimi (sahip yorumcuyu engellediyse yazılmaz — createNotification).
      await createNotification({ userId: post.authorId, actorId: userId, type: 'POST_COMMENT', postId });
      const mentions = await resolveMentions(userId, body);
      await saveMentions({ postId, commentId: created.id }, mentions);
      // Gönderi sahibi zaten yorum bildirimi aldı → etiket bildirimi ikinci kez gitmez.
      await notifyMentions(userId, postId, mentions.filter((m) => m.userId !== post.authorId));
      await fileAutoFlags({ type: 'COMMENT', id: created.id, authorId: userId }, gate.flags, 'comment');

      const comment = await prisma.postComment.findUniqueOrThrow({ where: { id: created.id }, select: commentSelect });
      return res.status(201).json(serializeComment(comment, userId));
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:post-comments', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
