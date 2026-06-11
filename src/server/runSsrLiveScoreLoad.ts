import { getServerLiveScoreClient } from '@/server/livescoreServerClient';
import { createRequestStatsStore } from '@/server/livescoreRequestStats';
import { timedSsrLoad } from '@/server/ssrTiming';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';

/**
 * SSR loader'ları için standart sarmalayıcı: in-process client + istek istatistikleri + süre logu.
 */
export async function runSsrLiveScoreLoad<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const stats = createRequestStatsStore();
  const client = getServerLiveScoreClient();
  return timedSsrLoad(label, () => runWithLiveScoreHttpClient(client, fn, stats));
}
