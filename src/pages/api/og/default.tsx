import type { NextRequest } from 'next/server';
import { OG_DEFAULT_IMAGE } from '@/config/brandImages';

export const config = {
  runtime: 'edge',
};

/**
 * Eski varsayılan paylaşım görseli adresi. Görsel artık statik dosya (`OG_DEFAULT_IMAGE`, scripts/generate-brand-images.mjs);
 * bu adres yalnızca daha önce paylaşılmış bağlantıların önbellekteki og:image'ı için kalıcı yönlendirme.
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
