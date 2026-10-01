const API_BASE_URL = '/api/livescore';

/**
 * `liveScoreService`in kullandığı istemci alt kümesi: `get(url, { params })` → `{ data }`. Sunucuda axios örnekleri
 * (`livescoreServerClient`) bu şekle uyar; tarayıcıda aşağıdaki fetch uyarlaması kullanılır.
 */
export type LiveScoreHttpClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- axios'taki gibi tipsiz çağrıda `data` serbest
  get<T = any>(url: string, config?: { params?: Record<string, unknown> }): Promise<{ data: T }>;
};

function buildUrl(url: string, params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const query = search.toString();
  return `${API_BASE_URL}${url}${query ? `?${query}` : ''}`;
}

/**
 * Tarayıcıdaki `/api/livescore` proxy istemcisi — axios yerine fetch (axios ~25 KB gzip ilk yükten çıkar).
 * axios gibi 2xx dışında hata fırlatır.
 */
export const liveScoreApi: LiveScoreHttpClient = {
  async get(url, config) {
    const response = await fetch(buildUrl(url, config?.params));
    if (!response.ok) {
      throw new Error(`LiveScore isteği başarısız: ${response.status} ${url}`);
    }
    return { data: await response.json() };
  },
};
