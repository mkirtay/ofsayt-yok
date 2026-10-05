/**
 * POST /api/assistant/analysis — AI Asistan maç analizi isteği (bkz. server/assistant/matchAnalysisRequest.ts).
 *
 * Gövde: `{ text }` (serbest metin, ör. "GS–Kasımpaşa maçını analiz et") ya da `{ match: { id, home, away, kickoffMs } }`
 * (seçenek seçildi / analiz açıldıktan sonra yenileme). Yeni analiz ÜRETMEZ, kredi düşmez; açma maç analizi ucuyla
 * (`POST /api/matches/[id]/analysis`) yapılır. Kilitli analizde yanıt yalnız ücretsiz önizlemeyi taşır.
 * Oturum isteğe bağlı (girişsizde önizleme + giriş çağrısı). Kullanıcı/IP başına dakikada 20 istek.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { getRequestAuth } from '@/lib/mobileAuth';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { loadViewer } from '@/server/analysisAccess';
import { analysisCardForMatch, answerMatchAnalysisRequest, type AssistantAnalysisCard } from '@/server/assistant/matchAnalysisRequest';
import { captureError } from '@/lib/logger';

type Body = { card: AssistantAnalysisCard } | { error: string };

function parseMatch(raw: unknown): { id: number; home: string; away: string; kickoffMs: number | null; status: string } | null {
  const m = raw as { id?: unknown; home?: unknown; away?: unknown; kickoffMs?: unknown } | null;
  const id = Number(m?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const name = (v: unknown) => (typeof v === 'string' ? v.slice(0, 80) : '');
  return { id, home: name(m?.home), away: name(m?.away), kickoffMs: typeof m?.kickoffMs === 'number' ? m.kickoffMs : null, status: '' };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<Body>) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const auth = await getRequestAuth(req, res);
  const rl = await hitFixedWindowRateLimit(`assistant:${auth?.id ?? requestIp(req.headers, req.socket.remoteAddress)}`, 20, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Çok fazla istek. Biraz bekleyin.' });
  }

  const body = (req.body ?? {}) as { text?: unknown; match?: unknown };
  try {
    const viewer = await loadViewer(auth?.id);
    if (body.match != null) {
      const match = parseMatch(body.match);
      if (!match) return res.status(400).json({ error: 'Geçersiz maç.' });
      return res.status(200).json({ card: await analysisCardForMatch(viewer, match) });
    }
    if (typeof body.text !== 'string' || !body.text.trim()) return res.status(400).json({ error: 'Mesaj boş.' });
    return res.status(200).json({ card: await answerMatchAnalysisRequest(viewer, body.text.slice(0, 200)) });
  } catch (e) {
    captureError('assistant-analysis', e);
    return res.status(500).json({ error: 'Şu an yanıt verilemiyor.' });
  }
}
