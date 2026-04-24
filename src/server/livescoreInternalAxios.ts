import type { IncomingMessage } from 'http';
import axios from 'axios';

/**
 * `getServerSideProps` içinden kendi `/api/livescore` proxy'mize gider;
 * `liveScoreService` ile aynı JSON dönüşümü tekrar yazılmaz.
 */
export function livescoreAxiosFromIncomingMessage(req: IncomingMessage) {
  const xfProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(xfProto) ? xfProto[0] : xfProto || 'http';
  const host = req.headers.host || 'localhost:3000';
  return axios.create({
    baseURL: `${proto}://${host}/api/livescore`,
    timeout: 25_000,
  });
}
