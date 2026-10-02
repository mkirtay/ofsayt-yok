import type { NextRequest } from 'next/server';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';

export const config = {
  runtime: 'edge',
};

/**
 * Eski serbest metinli maç görseli adresi (`?home=…&away=…&score=…`). Herkes sitenin adıyla istediği metni çizdirebildiği
 * için metin artık KABUL EDİLMEZ: daha önce paylaşılmış bağlantılar varsayılan görsele kalıcı yönlenir. Yeni adres:
 * `/api/og/match/{id}?v=…` (bkz. utils/matchOgImage.ts).
 */
export default function handler(req: NextRequest) {
  return new Response(null, {
    status: 308,
    headers: {
      Location: new URL(OG_DEFAULT_IMAGE.path, req.url).toString(),
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
    },
  });
}
