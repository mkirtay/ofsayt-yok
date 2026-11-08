/**
 * GET /api/gundem/entities/search?q= — Gündem "Ekle" seçicisi: oyuncu + takım + dün/bugün/yarının maçları.
 * Yalnız oturumlu (yazma aracı); kullanıcı başına dakikada 30 istek. `q` boşsa yalnız bugünün maçları.
 * Kaynaklar paylaşımlı önbellekli (bkz. lib/gundem/entitySearch.ts); bir kaynak hata verirse o grup boş döner.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { captureError } from '@/lib/logger';
import { getRequestUserId } from '@/lib/mobileAuth';
import { queryString } from '@/lib/gundem/validation';
import {
  ENTITY_SEARCH_LIMIT,
  PLAYER_SEARCH_MIN_CHARS,
  mapPlayerHits,
  normalizeEntityQuery,
  pickMatchHits,
  type EntitySearchResult,
} from '@/lib/gundem/entitySearch';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { loadHomeDay } from '@/server/homeDay';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    captureError(`gundem:entity-search:${label}`, e);
    return fallback;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const userId = await getRequestUserId(req, res);
  if (!userId) return res.status(401).json({ error: 'Giriş yapmanız gerekiyor.' });
  const rl = await hitFixedWindowRateLimit(`gundem-entity-search:user:${userId}`, 30, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla arama yaptınız. Biraz bekleyin.' });
  }

  const rawQ = queryString(req.query.q) ?? '';
  const q = normalizeEntityQuery(rawQ);
  if (rawQ.trim() && !q) return res.json({ players: [], teams: [], matches: [] } satisfies EntitySearchResult);

  const today = todayIsoIstanbul();
  const days = q ? [shiftIsoDate(today, -1), today, shiftIsoDate(today, 1)] : [today];
  const [players, teams, dayPayloads] = await Promise.all([
    q && q.length >= PLAYER_SEARCH_MIN_CHARS
      ? safe(
          'players',
          sportmonksClientRequest<Parameters<typeof mapPlayerHits>[0]>('football', `/players/search/${encodeURIComponent(q)}`, {}).then(
            (env) => mapPlayerHits(env.data ?? [], q),
          ),
          [],
        )
      : Promise.resolve([]),
    q
      ? safe(
          'teams',
          sportmonksClientRequest<{ id: number; name: string; image_path?: string | null }[]>(
            'football',
            `/teams/search/${encodeURIComponent(q)}`,
          ).then((env) =>
            (env.data ?? []).slice(0, ENTITY_SEARCH_LIMIT).map((t) => ({ id: t.id, name: t.name, logo: t.image_path ?? null })),
          ),
          [],
        )
      : Promise.resolve([]),
    safe('matches', Promise.all(days.map((d) => loadHomeDay(d))), []),
  ]);
  // Canlı liste en sonda: aynı maçın en güncel hâli.
  const lists = [...dayPayloads.map((p) => p.fixtureMatches), dayPayloads[0]?.liveMatches ?? []];
  const result: EntitySearchResult = { players, teams, matches: pickMatchHits(lists, q) };
  res.setHeader('Cache-Control', 'private, no-store');
  return res.json(result);
}
