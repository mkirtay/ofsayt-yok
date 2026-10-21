/**
 * X API istemcisi (OAuth 1.0a, kullanıcı bağlamı: @getscor3 adına). Anahtarlar Vercel env: X_API_KEY, X_API_SECRET,
 * X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (uygulama izni "Read and write" olmalı). Biri eksikse `null` (bot yazmaz).
 * Görsel yüklenemezse tweet metinle yine atılır (görsel isteğe bağlı).
 */
import { EUploadMimeType, TwitterApi } from 'twitter-api-v2';
import { captureError } from '@/lib/logger';

export type XPoster = { post: (text: string, image?: Buffer) => Promise<{ id: string }> };

export function createXPoster(env: NodeJS.ProcessEnv = process.env): XPoster | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET } = env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) return null;
  const client = new TwitterApi({
    appKey: X_API_KEY,
    appSecret: X_API_SECRET,
    accessToken: X_ACCESS_TOKEN,
    accessSecret: X_ACCESS_TOKEN_SECRET,
  });
  return {
    async post(text, image) {
      let mediaId: string | null = null;
      if (image) {
        try {
          mediaId = await client.v1.uploadMedia(image, { mimeType: EUploadMimeType.Png });
        } catch (e) {
          captureError('xbot:upload-media', e);
        }
      }
      const res = await client.v2.tweet(mediaId ? { text, media: { media_ids: [mediaId] } } : { text });
      return { id: res.data.id };
    },
  };
}
