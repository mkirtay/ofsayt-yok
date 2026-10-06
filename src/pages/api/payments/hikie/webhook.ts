/**
 * POST /api/payments/hikie/webhook — imzalı Hikie webhook'ları (order.paid kredi verir; order.updated yalnız log).
 * İmza HAM gövde üzerinden → Next gövde ayrıştırıcısı kapalı. Yanıt gövdesi BOŞ, 3xx yok; geçici hata (DB vb.) 503 →
 * Hikie yeniden dener; kalıcı 4xx abonelikte "failing" yapar, bu yüzden iş kuralı reddi bile 200 (bkz. handleHikieWebhook).
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleHikieWebhook } from '@/server/payments/paymentOrders';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;

export async function readRawBody(req: NextApiRequest, limit = MAX_BODY_BYTES): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer | string>) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > limit) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const raw = await readRawBody(req);
  if (raw == null) return res.status(400).end();
  try {
    const result = await handleHikieWebhook(req.headers, raw);
    if (result.status !== 200) console.warn(`[payments] webhook reddedildi: ${result.status} ${String(result.body.error)}`);
    return res.status(result.status).end();
  } catch (err) {
    console.error('[payments] webhook geçici hata', err instanceof Error ? err.message : err);
    return res.status(503).end();
  }
}
