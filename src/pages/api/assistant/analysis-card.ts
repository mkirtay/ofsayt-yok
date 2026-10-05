/**
 * POST /api/assistant/analysis-card — asistandaki analiz kartını yeniler (ör. "1 kredi ile aç" başarılı olduktan sonra).
 * Gövde: `{ match: { id, home, away, kickoffMs } }`. LLM yok, üretim yok, kredi düşmez; erişim kuralı analiz ucuyla aynı
 * (server/assistant/matchAnalysisRequest.ts). Kilitliyse yanıt yalnız ücretsiz önizlemeyi taşır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getRequestAuth } from '@/lib/mobileAuth';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadViewer } from '@/server/analysisAccess';
import { analysisCardForMatch, type AssistantAnalysisCard } from '@/server/assistant/matchAnalysisRequest';
import { captureError } from '@/lib/logger';

type Body = { card: AssistantAnalysisCard } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const auth = await getRequestAuth(req, res);
  const rl = await hitFixedWindowRateLimit(`assistant-card:${auth?.id ?? requestIp(req.headers, req.socket?.remoteAddress)}`, 20, 60_000);
  if (!rl.success) return res.status(429).json({ error: 'Çok fazla istek.' });

  const m = (req.body as { match?: { id?: unknown; home?: unknown; away?: unknown; kickoffMs?: unknown } } | undefined)?.match;
  const id = Number(m?.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Geçersiz maç.' });
  const name = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  try {
    const viewer = await loadViewer(auth?.id);
    const card = await analysisCardForMatch(viewer, { id, home: name(m?.home), away: name(m?.away), kickoffMs: typeof m?.kickoffMs === 'number' ? m.kickoffMs : null, status: '' });
    return res.status(200).json({ card });
  } catch (e) {
    captureError('assistant-analysis-card', e);
    return res.status(500).json({ error: 'Şu an yanıt verilemiyor.' });
  }
}
