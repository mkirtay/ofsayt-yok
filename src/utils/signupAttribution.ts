/**
 * Kayıt kaynağı (ilk temas) — istemci ve sunucu ortak doğrulaması.
 *
 * Tarayıcı, oturumun ilk sayfasındaki `utm_source`/`utm_medium`/`utm_campaign` ile o anın zamanını
 * yalnızca oturum boyunca `sessionStorage`'da tutar (kalıcı çerez yok, üçüncü taraf araç yok). Kayıtta
 * (e-posta: istek gövdesi; Google: ilk girişten sonra `/api/user/attribution`) bir kez hesaba yazılır.
 */
export type SignupAttributionPayload = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  /** Oturumun ilk giriş zamanı (ISO). */
  firstTouchAt: string;
};

export type SignupAttributionFields = {
  signupUtmSource: string | null;
  signupUtmMedium: string | null;
  signupUtmCampaign: string | null;
  firstTouchAt: Date;
};

const MAX_LEN = 100;
/** Harf/rakam ve kampanya adlarında yaygın ayraçlar; HTML/kontrol karakterleri reddedilir. */
const VALUE_RE = /^[\p{L}\p{N} ._~+\-:/|()]+$/u;
/** Tarayıcı oturumu bundan uzun sürmez; daha eski/ileri tarih = bozuk ya da uydurma veri. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

export function cleanUtmValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().slice(0, MAX_LEN);
  return v && VALUE_RE.test(v) ? v : null;
}

/** Gövdeden gelen değeri doğrular; geçersizse `null` (kayıt yine yapılır, yalnız kaynak yazılmaz). */
export function parseSignupAttribution(raw: unknown, now: number = Date.now()): SignupAttributionFields | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const t = typeof r.firstTouchAt === 'string' ? Date.parse(r.firstTouchAt) : NaN;
  if (!Number.isFinite(t) || t > now + CLOCK_SKEW_MS || now - t > MAX_AGE_MS) return null;
  return {
    signupUtmSource: cleanUtmValue(r.source),
    signupUtmMedium: cleanUtmValue(r.medium),
    signupUtmCampaign: cleanUtmValue(r.campaign),
    firstTouchAt: new Date(t),
  };
}
