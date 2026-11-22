/**
 * "Takımım" sezon paketi (büyüme raporu 2.8) — GET: fiyat, sezon, paketlerim; POST { teamId }: krediyle al.
 * Yalnız Süper Lig takımları (ön üretim tüm Süper Lig maçlarını kapsar; puan tablosu önbellekten). Bayrak kapalıysa 404.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/lib/requireAuth';
import { captureError } from '@/lib/logger';
import { InsufficientCreditsError } from '@/lib/credits';
import { readJsonBody } from '@/lib/gundem/validation';
import { hitFixedWindowRateLimit } from '@/lib/rateLimit';
import { buyTeamPass, myTeamPasses, passSeason, teamPassCost, teamPassEnabled, TeamPassOwnedError } from '@/lib/teamPass';
import { getCompetitionTableFull } from '@/services/liveScoreService';
import { SUPER_LIG } from '@/server/analysisPregen';

/** Süper Lig takımı mı (güncel tablo); ad tablodan alınır (istemciden değil). */
async function superLigTeam(teamId: number): Promise<{ id: number; name: string } | null> {
  const table = await getCompetitionTableFull(String(SUPER_LIG)).catch(() => null);
  const rows = [...(table?.table ?? []), ...(table?.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))];
  const row = rows.find((r) => Number(r.team?.id ?? r.team_id) === teamId);
  const name = row?.team?.name;
  return row && name ? { id: teamId, name } : null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!teamPassEnabled()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const guard = await requireAuth(req, res);
  if (!guard.ok) return;
  try {
    if (req.method === 'GET') return res.status(200).json({ cost: teamPassCost(), season: passSeason(), passes: await myTeamPasses(guard.userId) });
    const rl = await hitFixedWindowRateLimit(`team-pass:user:${guard.userId}`, 10, 3_600_000);
    if (!rl.success) return res.status(429).json({ error: 'Çok fazla istek.' });
    const teamId = Number((readJsonBody(req) as { teamId?: unknown }).teamId);
    const team = Number.isInteger(teamId) && teamId > 0 ? await superLigTeam(teamId) : null;
    if (!team) return res.status(400).json({ error: 'Sezon paketi şimdilik yalnız Süper Lig takımları için.', code: 'NOT_ELIGIBLE' });
    return res.status(200).json(await buyTeamPass(guard.userId, team));
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return res.status(402).json({ error: 'Yetersiz kredi.', code: 'INSUFFICIENT_CREDITS' });
    if (e instanceof TeamPassOwnedError) return res.status(409).json({ error: e.message, code: 'OWNED' });
    captureError('team-pass', e);
    return res.status(500).json({ error: 'Sunucu hatası.' });
  }
}
