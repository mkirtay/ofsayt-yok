import { Redis } from '@upstash/redis';

let client: Redis | null = null;

export function getRedisClient(): Redis | null {
  if (client) return client;
  // Vercel KV entegrasyonu KV_REST_API_* prefix'i kullanır; direkt Upstash UPSTASH_REDIS_REST_* kullanır
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token });
  return client;
}
