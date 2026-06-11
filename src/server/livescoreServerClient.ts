/**
 * Sunucu-içi LiveScore istemcisi: doğrudan upstream'e gider, paylaşımlı cache kullanır.
 * SSR loader'ları localhost HTTP hop'u (/api/livescore self-request) yerine bunu kullanır.
 */
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import {
  buildCacheKey,
  getCacheTtlSeconds,
  readCache,
  writeCache,
} from '@/lib/livescoreCache';
import { recordCacheHit, recordUpstreamRequest } from '@/server/livescoreRequestStats';

const API_BASE = 'https://livescore-api.com/api-client';

let singleton: AxiosInstance | null = null;

function paramsToQueryRecord(
  params: Record<string, unknown> | undefined
): Record<string, string | string[] | undefined> {
  if (!params) return {};
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

function pathFromUrl(url: string | undefined): string {
  if (!url) return '';
  return url.replace(/^\//, '').replace(/\.json$/i, '');
}

export function getServerLiveScoreClient(): AxiosInstance {
  if (singleton) return singleton;

  const instance = axios.create({ timeout: 25_000 });

  instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const method = (config.method ?? 'get').toLowerCase();
    if (method !== 'get') return config;

    const path = pathFromUrl(config.url);
    const isBinary = /\.(png|jpe?g|gif|webp)$/i.test(path);
    const params = paramsToQueryRecord(config.params as Record<string, unknown>);
    const ttl = !isBinary ? getCacheTtlSeconds(path) : null;
    const cacheKey = ttl != null ? buildCacheKey(path, params) : null;

    if (cacheKey && ttl != null) {
      const cached = await readCache(cacheKey);
      if (cached !== null && cached !== undefined) {
        recordCacheHit();
        config.adapter = async () => ({
          data: cached,
          status: 200,
          statusText: 'OK',
          headers: { 'x-cache': 'HIT' },
          config,
        });
        return config;
      }
    }

    config.adapter = async (cfg) => {
      const key = process.env.LIVESCORE_API_KEY;
      const secret = process.env.LIVESCORE_API_SECRET;
      if (!key || !secret) {
        throw new Error('Missing LiveScore API credentials');
      }

      const p = pathFromUrl(cfg.url);
      const cfgParams = paramsToQueryRecord(cfg.params as Record<string, unknown>);
      const query = new URLSearchParams();
      for (const [k, v] of Object.entries(cfgParams)) {
        if (v !== undefined) {
          const val = Array.isArray(v) ? v.join(',') : v;
          query.set(k, val);
        }
      }
      query.set('key', key);
      query.set('secret', secret);

      const cfgBinary = /\.(png|jpe?g|gif|webp)$/i.test(p);
      const url = cfgBinary
        ? `${API_BASE}/${p}?${query.toString()}`
        : `${API_BASE}/${p}.json?${query.toString()}`;

      recordUpstreamRequest();
      const upstream = await fetch(url);
      const contentType = upstream.headers.get('content-type') || '';
      const treatAsBinary = cfgBinary || contentType.startsWith('image/');

      if (treatAsBinary) {
        const buf = Buffer.from(await upstream.arrayBuffer());
        return {
          data: buf,
          status: upstream.status,
          statusText: upstream.statusText,
          headers: { 'content-type': contentType || 'application/octet-stream' },
          config: cfg,
        };
      }

      const data = await upstream.json();
      const cfgTtl = getCacheTtlSeconds(p);
      const isSuccessful =
        upstream.status === 200 &&
        (data == null ||
          typeof data !== 'object' ||
          (data as { success?: unknown }).success !== false);

      if (cfgTtl != null && isSuccessful) {
        const ck = buildCacheKey(p, cfgParams);
        void writeCache(ck, data, cfgTtl);
      }

      return {
        data,
        status: upstream.status,
        statusText: upstream.statusText,
        headers: { 'x-cache': 'MISS' },
        config: cfg,
      };
    };

    return config;
  });

  singleton = instance;
  return instance;
}
