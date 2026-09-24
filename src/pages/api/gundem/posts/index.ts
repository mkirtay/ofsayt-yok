import type { NextApiRequest, NextApiResponse } from 'next';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { POST_MAX_LENGTH, matchPostsInAllFeed } from '@/config/gundem';
import {
  PAGE_SIZE,
  optionalInt,
  queryString,
  readJsonBody,
} from '@/lib/gundem/validation';
import { feedOrder, paginate, postSelect, serializePosts } from '@/lib/gundem/posts';
import { getOfficialAccountEmails } from '@/lib/gundem/official';
import {
  FEED_CACHE_TTL_SECONDS,
  FEED_GET_RATE_LIMIT,
  FEED_GET_RATE_WINDOW_MS,
  feedCacheKey,
  isFeedCacheable,
} from '@/lib/gundem/feedCache';
import { MatchSnapshotError, ensureMatchSnapshot, normalizeFixtureId } from '@/lib/gundem/matchSnapshot';

const SCOPES = ['all', 'following', 'official', 'match'] as const;
type Scope = (typeof SCOPES)[number];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const ip = requestIp(req.headers as Record<string, string | string[] | undefined>, req.socket?.remoteAddress);
      const rl = await hitFixedWindowRateLimit(`gundem-feed:ip:${ip}`, FEED_GET_RATE_LIMIT, FEED_GET_RATE_WINDOW_MS);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla istek gönderdiniz. Biraz bekleyin.' });
      }

      const scopeRaw = queryString(req.query.scope) ?? 'all';
      if (!(SCOPES as readonly string[]).includes(scopeRaw)) {
        return res.status(400).json({ error: 'Geçersiz akış türü.' });
      }
      const scope = scopeRaw as Scope;
      const cursor = queryString(req.query.cursor);
      // Tek maçın forumu: `scope=match&matchId=<fixtureId>`. matchId yalnızca `match` scope'unda anlamlı.
      let matchId: string | null = null;
      try {
        matchId = normalizeFixtureId(queryString(req.query.matchId));
      } catch {
        return res.status(400).json({ error: 'Geçersiz maç.' });
      }
      if (matchId && scope !== 'match') return res.status(400).json({ error: 'matchId yalnızca maç akışında kullanılabilir.' });
      const viewerId = await getRequestUserId(req, res);

      // Paylaşılan cache yalnızca oturumsuz + all/official/match (bkz. feedCache.ts); oturumlu istek her zaman DB'den.
      const cacheable = isFeedCacheable(scope, viewerId);
      const cacheKey = feedCacheKey(scope, cursor, { matchId, matchPostsInAll: matchPostsInAllFeed() });
      if (cacheable) {
        const cached = await readCache(cacheKey);
        if (cached !== null && cached !== undefined) {
          res.setHeader('X-Cache', 'HIT');
          return res.json(cached);
        }
      }

      const where: Prisma.PostWhereInput = { deletedAt: null };
      if (scope === 'all') {
        if (!matchPostsInAllFeed()) where.matchId = null;
      } else if (scope === 'match') {
        where.matchId = matchId ?? { not: null };
      } else if (scope === 'official') {
        where.OR = [{ authorType: 'OFFICIAL_BOT' }, { author: { email: { in: getOfficialAccountEmails() } } }];
      } else if (scope === 'following') {
        if (!viewerId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
        const follows = await prisma.follow.findMany({
          where: { followerId: viewerId },
          select: { followingId: true },
        });
        where.authorId = { in: follows.map((f) => f.followingId) };
      }

      const rows = await prisma.post.findMany({
        where,
        orderBy: [...feedOrder],
        take: PAGE_SIZE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: postSelect(viewerId),
      });
      const { items, nextCursor } = paginate(rows, PAGE_SIZE);
      const page = { items: await serializePosts(items, viewerId), nextCursor };
      if (cacheable) {
        // Boş cursor'lı / matchId'li sayfa yazılmaz: rastgele cursor ya da matchId'lerle cache anahtarı şişirilemesin.
        if ((!cursor && !matchId) || items.length > 0) await writeCache(cacheKey, page, FEED_CACHE_TTL_SECONDS);
        res.setHeader('X-Cache', 'MISS');
      } else {
        res.setHeader('X-Cache', 'BYPASS');
      }
      return res.json(page);
    }

    if (req.method === 'POST') {
      const userId = await getRequestUserId(req, res);
      if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });

      const rl = await hitFixedWindowRateLimit(`gundem-post:user:${userId}`, 5, 60_000);
      if (!rl.success) {
        res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
        return res.status(429).json({ error: 'Çok fazla gönderi paylaştınız. Biraz bekleyin.' });
      }

      const input = readJsonBody(req);
      const body = sanitizePlainText(typeof input.body === 'string' ? input.body : '', { allowNewlines: true });
      if (!body || body.length > POST_MAX_LENGTH) {
        return res.status(400).json({ error: `Gönderi 1–${POST_MAX_LENGTH} karakter olmalıdır.` });
      }

      const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!userExists) return res.status(401).json({ error: 'Oturum geçersiz. Lütfen tekrar giriş yapın.' });

      // matchId verildiyse maç gerçek olmalı: rozet verisi (MatchSnapshot) burada garanti edilir.
      let matchId: string | null = null;
      try {
        matchId = normalizeFixtureId(input.matchId);
        if (matchId) await ensureMatchSnapshot(matchId);
      } catch (e) {
        if (e instanceof MatchSnapshotError) {
          return res.status(e.reason === 'upstream' ? 503 : 400).json({ error: e.message });
        }
        throw e;
      }

      // authorType istemciden ASLA okunmaz: kullanıcı postları her zaman USER.
      const created = await prisma.post.create({
        data: {
          authorId: userId,
          authorType: 'USER',
          body,
          matchId,
          teamId: optionalInt(input.teamId),
        },
        select: postSelect(userId),
      });
      const [post] = await serializePosts([created], userId);
      return res.status(201).json(post);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (e) {
    captureError('gundem:posts', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
