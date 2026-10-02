import type { NextApiResponse } from 'next';
import type { ImageResponse } from 'next/og';

/** `next/og` yanıtını (Web `Response`) Pages API (Node) yanıtına aktarır. */
export async function sendImageResponse(res: NextApiResponse, image: ImageResponse, cacheControl: string): Promise<void> {
  const body = Buffer.from(await image.arrayBuffer());
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', cacheControl);
  res.status(200).send(body);
}

export function redirect(res: NextApiResponse, location: string, cacheControl: string, status: 307 | 308 = 307): void {
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', cacheControl);
  res.status(status).end();
}
