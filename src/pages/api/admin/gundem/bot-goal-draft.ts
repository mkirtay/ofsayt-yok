/**
 * GET /api/admin/gundem/bot-goal-draft?fixtureId=<id>&eventId=<id>
 *
 * Bir gol olayından Gündem post TASLAĞI üretir (düz template, gerçek veri). SALT OKUNUR: hiçbir şey yayınlamaz/yazmaz.
 * Yayın için dönen `body`/`externalKey`/`matchId`/`teamId` ayrıca `POST /api/admin/gundem/bot-post`'a gönderilir.
 * Erişim: `Authorization: Bearer $CRON_SECRET` ya da ADMIN oturumu. Sportmonks kotası: 1 Fixture + ~2 Topscorer isteği.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { queryString } from '@/lib/gundem/validation';
import { requireCronOrAdmin } from '@/lib/gundem/botAuth';
import { fetchGoalDraft } from '@/lib/gundem/bot/goalDraft';

function positiveInt(v: string | null): number | null {
  return v && /^\d{1,12}$/.test(v) ? Number(v) : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  try {
    if (!(await requireCronOrAdmin(req, res))) return;
    const fixtureId = positiveInt(queryString(req.query.fixtureId));
    const eventId = positiveInt(queryString(req.query.eventId));
    if (!fixtureId || !eventId) return res.status(400).json({ error: 'fixtureId ve eventId sayı olmalıdır.' });

    const draft = await fetchGoalDraft(fixtureId, eventId);
    if (!draft.ok) return res.status(404).json({ error: 'Taslak üretilemedi.', reason: draft.reason });
    return res.status(200).json({ draft });
  } catch (e) {
    captureError('gundem:bot-goal-draft', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
