/**
 * GET /api/matches/[id]/archived-status
 *
 * Maç canlı sağlayıcıda bulunamadığında client-side sayfa bu endpoint ile
 * matchId için saklı bir MatchAnalysis/MatchTrivia kaydı olup olmadığını
 * kontrol eder — "gerçekten yok" (404 sayfa) ile "arşivlenmiş ama saklı
 * verisi var" durumlarını ayırt etmek için kullanılır.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { hitFixedWindowRateLimit, requestIp } from '@/lib/rateLimit';
import { hasStoredMatchData } from '@/server/buildMatchAnalysisContext';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  const matchId = Array.isArray(id) ? id[0] : id;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId zorunlu' });
  }

  const ip = requestIp(
    req.headers as Record<string, string | string[] | undefined>,
    req.socket?.remoteAddress,
  );
  const rl = await hitFixedWindowRateLimit(`archived-status:${ip}`, 60, 60_000);
  if (!rl.success) {
    res.setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now()) / 1000)));
    return res.status(429).json({ error: 'Too many requests' });
  }

  try {
    const isArchived = await hasStoredMatchData(matchId);
    res.setHeader('Cache-Control', 'private, max-age=30');
    return res.status(200).json({ isArchived });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sunucu hatası';
    return res.status(500).json({ error: message });
  }
}
