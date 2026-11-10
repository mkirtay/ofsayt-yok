/**
 * Yönetici: kombine aracı (COMBO_TOOL_ENABLED kapalıyken 404). Yalnız ADMIN (middleware + requireAdmin).
 * GET  ?date=YYYY-MM-DD[&past=1] → { candidates, history }   (API-Football'a istek YOK)
 * POST { date, picks: [{ matchId }] }  → { odds }              (yalnız seçilen maçlar için eşleme + oran; ≤ 12 maç)
 * Oranlar "yaklaşık piyasa oranı"dır (uluslararası bookmaker); Türk bahis şirketi oranı değildir.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { comboToolEnabled } from '@/config/comboTool';
import { requireAdmin } from '@/lib/requireAuth';
import { loadComboCandidates, loadComboHistory } from '@/server/combo/candidates';
import { resolveOdds } from '@/server/combo/afOdds';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PICKS = 12;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!comboToolEnabled()) return res.status(404).json({ error: 'Not found' });
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const guard = await requireAdmin(req, res);
  if (!guard.ok) return;

  if (req.method === 'GET') {
    const date = String(req.query.date ?? '');
    if (!ISO_DAY.test(date)) return res.status(400).json({ error: 'date (YYYY-MM-DD) gerekli.' });
    const [candidates, history] = await Promise.all([loadComboCandidates(date, { includePast: req.query.past === '1' }), loadComboHistory()]);
    return res.status(200).json({ date, candidates, history });
  }

  const body = (req.body ?? {}) as { date?: unknown; picks?: unknown };
  const date = typeof body.date === 'string' ? body.date : '';
  const ids = Array.isArray(body.picks)
    ? body.picks.map((p) => (p && typeof p === 'object' ? String((p as { matchId?: unknown }).matchId ?? '') : '')).filter(Boolean)
    : [];
  if (!ISO_DAY.test(date) || ids.length === 0 || ids.length > MAX_PICKS) {
    return res.status(400).json({ error: `date ve 1–${MAX_PICKS} maç gerekli.` });
  }
  // Pazar anahtarı ve kickoff istemciden alınmaz: sunucu adayları yeniden üretir (önbellekten), yalnız seçilenleri işler.
  const all = await loadComboCandidates(date, { includePast: true });
  const wanted = new Set(ids);
  const selected = all.filter((c) => wanted.has(c.matchId));
  const odds = await resolveOdds(
    selected.map((c) => ({
      matchId: c.matchId,
      key: c.key,
      kickoffMs: c.kickoffIso ? Date.parse(c.kickoffIso) : null,
      home: c.homeName,
      away: c.awayName,
    })),
  );
  return res.status(200).json({ odds });
}
