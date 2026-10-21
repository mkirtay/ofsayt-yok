/**
 * POST /api/admin/x/test — belirli maç için tweet üretir; `post: true` ise GERÇEKTEN atar (X_BOT_MODE'dan bağımsız tek seferlik).
 * Gövde: { kind: 'goal' | 'final', fixtureId: number, minute?: number, post?: boolean }. Yalnız CRON_SECRET (Bearer) ya da ADMIN.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCronOrAdmin } from '@/lib/gundem/botAuth';
import { captureError } from '@/lib/logger';
import { buildManualTweet } from '@/lib/xbot/manual';
import { createXPoster } from '@/lib/xbot/xClient';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  if (!(await requireCronOrAdmin(req, res))) return;
  const { kind, fixtureId, minute, post } = (req.body ?? {}) as { kind?: unknown; fixtureId?: unknown; minute?: unknown; post?: unknown };
  if ((kind !== 'goal' && kind !== 'final') || !Number.isSafeInteger(fixtureId)) {
    return res.status(400).json({ error: "kind ('goal' | 'final') ve fixtureId (sayı) gerekli." });
  }
  try {
    const tweet = await buildManualTweet(kind, fixtureId as number, Number.isSafeInteger(minute) ? (minute as number) : undefined);
    if (post !== true) return res.status(200).json({ ok: true, posted: false, text: tweet.text, image: tweet.image != null });
    const poster = createXPoster();
    if (!poster) return res.status(400).json({ error: 'X anahtarları tanımlı değil.' });
    const { id } = await poster.post(tweet.text, tweet.image ?? undefined);
    return res.status(200).json({ ok: true, posted: true, tweetId: id, text: tweet.text, image: tweet.image != null });
  } catch (e) {
    captureError('xbot:test', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Sunucu hatası.' });
  }
}
