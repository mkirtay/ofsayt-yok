/**
 * Bilinen AI / kazıyıcı botlar (Sportmonks Fixture havuzunu en çok tüketen kaynak: maç sayfası SSR taraması).
 *
 * Karar (2026-11-16): AI botları siteye ERİŞEBİLİR ama Sportmonks'a hiç istek attıramaz. `isLightPageBot` olan istek maç
 * sayfasında hafif sürüm alır ve maç verisi YALNIZ önbellekten (Redis) gelir (`withSportmonksCacheOnly`); önbellekte yoksa
 * 503 + Retry-After. ISR sayfaları (ana sayfa, takım, lig, hakem…) zaten CDN kopyasından servis edilir.
 *
 * - `AI_TRAINING_AGENTS`: model eğitimi / AI tarama botları. robots'ta artık engelli değil (önceden tüm siteden engelliydi).
 * - `ROBOTS_BLOCKED_AI_AGENTS`: robots'u da kotayı da zorlayan, AI ürününde kaynak göstermeyen saldırgan kazıyıcılar —
 *   tüm siteden engelli kalır.
 *
 * Arama motorları (Googlebot ve tüm Google tarayıcıları, Bingbot, YandexBot, Applebot, DuckDuckBot) ve bağlantı önizleme
 * botları (facebookexternalhit, Twitterbot, WhatsApp, TelegramBot, Slackbot, Discordbot) bu listelerde YOK: tam içerik.
 * `Google-Extended` / `Applebot-Extended` yalnız robots belirteci (ayrı UA değil).
 */
export const AI_TRAINING_AGENTS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
  'cohere-training-data-crawler',
  'AI2Bot',
  'YouBot',
] as const;

export const ROBOTS_BLOCKED_AI_AGENTS = ['Bytespider', 'Diffbot', 'ImagesiftBot', 'Omgilibot', 'Timpibot'] as const;

/**
 * AI ARAMA botları (GEO, 2026-11-15): kullanıcı soru sorduğunda kaynak arayan / arama dizini kuran botlar. robots'ta
 * engellenmez (ChatGPT / Claude / Perplexity cevaplarında Scor3 kaynak gösterilebilsin) ama maç sayfasında HAFİF sürüm
 * alır → Sportmonks'a ek istek yok (yalnız önbellek).
 */
export const AI_SEARCH_AGENTS = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User'] as const;

/** robots belirteci olmayan, UA'da görünen ek botlar (hafif sürüm). */
const LIGHT_PAGE_EXTRA_AGENTS = [
  ...AI_SEARCH_AGENTS,
  'meta-externalfetcher',
  'AhrefsBot',
  'SemrushBot',
  'MJ12bot',
  'DotBot',
  'PetalBot',
  'DataForSeoBot',
  'Barkrowler',
  'BLEXBot',
  'serpstatbot',
  'SeekportBot',
  'Scrapy',
];

const ROBOTS_ONLY_TOKENS = new Set(['Google-Extended', 'Applebot-Extended']);

const LIGHT_PAGE_BOT_RE = new RegExp(
  [...[...AI_TRAINING_AGENTS, ...ROBOTS_BLOCKED_AI_AGENTS].filter((a) => !ROBOTS_ONLY_TOKENS.has(a)), ...LIGHT_PAGE_EXTRA_AGENTS]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'i',
);

export function isLightPageBot(userAgent: string | string[] | null | undefined): boolean {
  const ua = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  return Boolean(ua) && LIGHT_PAGE_BOT_RE.test(ua!);
}
