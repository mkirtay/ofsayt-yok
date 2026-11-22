/** E-postadaki tek tık abonelikten çıkma (büyüme raporu 3.3): imzalı bağlantı → izin silinir → sade onay sayfası. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { captureError } from '@/lib/logger';
import { setDigestOptIn, verifyUnsubscribe } from '@/lib/weeklyDigest';

const page = (msg: string) =>
  `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>Scor3</title></head><body style="font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px"><p>${msg}</p><p><a href="/">Scor3 ana sayfa</a></p></body></html>`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const u = typeof req.query.u === 'string' ? req.query.u : '';
  const s = typeof req.query.s === 'string' ? req.query.s : '';
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!verifyUnsubscribe(u, s)) return res.status(400).send(page('Bağlantı geçersiz.'));
  try {
    await setDigestOptIn(u, false);
    return res.status(200).send(page('Haftalık özet aboneliğin iptal edildi. Bir daha bu e-postayı almayacaksın.'));
  } catch (e) {
    captureError('digest-unsubscribe', e);
    return res.status(500).send(page('Bir sorun oluştu, biraz sonra tekrar dene.'));
  }
}
