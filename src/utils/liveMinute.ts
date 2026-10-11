/**
 * Canlı dakika etiketi. API `time` alanı kaynağa göre "51" ya da "51'" gelir; sondaki kesme atılıp tek kesme eklenir
 * ("51''" görünmesin). Boş/yalnız kesme → ''.
 */
export function liveMinuteValue(time: string | number | null | undefined): string {
  return String(time ?? '').trim().replace(/'+$/u, '').trim();
}

export function liveMinuteLabel(time: string | number | null | undefined): string {
  const v = liveMinuteValue(time);
  return v ? `${v}'` : '';
}
