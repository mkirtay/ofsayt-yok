/**
 * GET /api/admin/sportmonks-usage?hours=24 — Sportmonks saatlik havuzlarını hangi rotaların ne kadar tükettiği.
 * Kaynak: `server/sportmonks/poolGuard.ts` sayaçları (yalnız GERÇEK upstream istekleri; cache isabetleri sayılmaz),
 * saat UTC. Her saat için rota × havuz × kaynak (proxy|server) istek sayısı ve 429 sayısı; ayrıca dönem toplamı.
 * CRON_SECRET ya da ADMIN oturumu.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireCronOrAdmin } from '@/lib/gundem/botAuth';
import { readUsage, type UsageRow } from '@/server/sportmonks/poolGuard';

const MAX_HOURS = 8 * 24;

export function summarizeUsage(hours: { rows: UsageRow[] }[]): UsageRow[] {
  const total = new Map<string, UsageRow>();
  for (const h of hours) {
    for (const r of h.rows) {
      const key = `${r.pool}|${r.route}|${r.origin}`;
      const t = total.get(key) ?? { ...r, calls: 0, rateLimited: 0 };
      t.calls += r.calls;
      t.rateLimited += r.rateLimited;
      total.set(key, t);
    }
  }
  return [...total.values()].sort((a, b) => b.calls - a.calls || a.route.localeCompare(b.route));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!(await requireCronOrAdmin(req, res))) return;

  const requested = Number(req.query.hours ?? 24);
  const hours = Number.isFinite(requested) ? Math.min(MAX_HOURS, Math.max(1, Math.floor(requested))) : 24;
  const byHour = await readUsage(hours, Date.now());
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ hours, total: summarizeUsage(byHour), byHour });
}
