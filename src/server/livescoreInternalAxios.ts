import type { IncomingMessage } from 'http';
import { getServerLiveScoreClient } from '@/server/livescoreServerClient';

/**
 * SSR loader'ları için LiveScore HTTP istemcisi.
 * Artık self-HTTP (`${host}/api/livescore`) yerine in-process doğrudan upstream + cache kullanır.
 * `req` parametresi geriye dönük uyumluluk için korunur (kullanılmaz).
 */
export function livescoreAxiosFromIncomingMessage(_req?: IncomingMessage) {
  return getServerLiveScoreClient();
}

/** Yeni kod için tercih edilen isim. */
export function livescoreServerClient() {
  return getServerLiveScoreClient();
}
