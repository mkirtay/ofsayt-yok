/**
 * Bilinen AI / kazıyıcı botlar (Sportmonks Fixture havuzunu en çok tüketen kaynak: maç sayfası SSR taraması).
 *
 * - `ROBOTS_BLOCKED_AI_AGENTS`: robots.txt'te tüm siteden engellenir (model eğitimi / AI tarama). robots'a uyan botlar
 *   hiç gelmez.
 * - `isLightPageBot`: maç sayfası SSR'ında hafif sürüm alır (H2H/form/istatistik/kadro sunucuda çekilmez, CDN'de
 *   saklanmaz). robots'a uymayanlar + kullanıcı tetiklemeli AI ajanları (ChatGPT-User, Claude-User…) + SEO kazıyıcıları.
 *
 * Arama motorları (Googlebot ve tüm Google tarayıcıları, Bingbot, YandexBot, Applebot, DuckDuckBot) ve bağlantı önizleme
 * botları (facebookexternalhit, Twitterbot, WhatsApp, TelegramBot, Slackbot, Discordbot) bu listelerde YOK: tam içerik.
 * `Google-Extended` / `Applebot-Extended` yalnız robots belirteci (ayrı UA değil): Gemini / Apple model eğitimini kapatır,
 * Google / Apple aramasını etkilemez.
 */
export const ROBOTS_BLOCKED_AI_AGENTS = [
  'GPTBot',
  'ClaudeBot',
  'anthropic-ai',
  'CCBot',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
  'cohere-training-data-crawler',
  'Diffbot',
  'ImagesiftBot',
  'Omgilibot',
  'Timpibot',
  'AI2Bot',
  'YouBot',
] as const;

/**
 * AI ARAMA botları (GEO, 2026-11-15): kullanıcı soru sorduğunda kaynak arayan / arama dizini kuran botlar. robots'ta
 * engellenmez (ChatGPT / Claude / Perplexity cevaplarında Scor3 kaynak gösterilebilsin) ama maç sayfasında HAFİF sürüm
 * alır → Sportmonks'a ek istek yok. Eğitim botları (GPTBot, ClaudeBot, CCBot…) yukarıda engelli kalır.
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
  [...ROBOTS_BLOCKED_AI_AGENTS.filter((a) => !ROBOTS_ONLY_TOKENS.has(a)), ...LIGHT_PAGE_EXTRA_AGENTS]
    .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'i',
);

export function isLightPageBot(userAgent: string | string[] | null | undefined): boolean {
  const ua = Array.isArray(userAgent) ? userAgent.join(' ') : userAgent;
  return Boolean(ua) && LIGHT_PAGE_BOT_RE.test(ua!);
}
