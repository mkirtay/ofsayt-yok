/** Upstream: `countries/flag.json?country_id=` → PNG (proxy path uzantısız) */
export const FLAG_PROXY_PATH = '/api/livescore/countries/flag';

export function countryFlagImgSrc(countryId: number): string {
  return `${FLAG_PROXY_PATH}?country_id=${countryId}`;
}
