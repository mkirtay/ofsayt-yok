/**
 * GET /api/payments/packages — satıştaki KREDİ paketlerinin anahtarları (kredi popup'ı için; /pricing build anında aynı
 * bilgiyi getStaticProps'tan alır). Yalnız env'e bakar (link / secret istemciye gitmez), CDN'de 5 dk önbellek.
 * Yönetici test paketi listelenmez.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { CREDIT_PACKAGES } from '@/config/creditPackages';
import { availablePackageKeys } from '@/config/paymentPackages';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const onSale = new Set(availablePackageKeys());
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({ available: CREDIT_PACKAGES.map((p) => p.paymentKey).filter((k) => onSale.has(k)) });
}
