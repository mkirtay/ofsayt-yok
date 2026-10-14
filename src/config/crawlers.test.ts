import { describe, expect, it } from 'vitest';
import { isLightPageBot, ROBOTS_BLOCKED_AI_AGENTS } from './crawlers';
import { buildRobotsTxt } from '@/pages/robots.txt';

const UA = {
  googlebot: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.122 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  googleInspect: 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
  bingbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
  yandex: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  applebot: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  twitter: 'Twitterbot/1.0',
  whatsapp: 'WhatsApp/2.23.20.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  gptbot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  claudebot: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  ccbot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  perplexity: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  chatgptUser: 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ahrefs: 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  bytespider: 'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
};

describe('isLightPageBot', () => {
  it('arama motorları, bağlantı önizleme botları ve tarayıcılar tam sayfa alır', () => {
    for (const k of ['googlebot', 'googleInspect', 'bingbot', 'yandex', 'applebot', 'facebook', 'twitter', 'whatsapp', 'iphone', 'chrome'] as const) {
      expect(isLightPageBot(UA[k]), k).toBe(false);
    }
    expect(isLightPageBot(undefined)).toBe(false);
    expect(isLightPageBot('')).toBe(false);
  });

  it('AI ve kazıyıcı botlar hafif sayfa alır (büyük/küçük harf duyarsız)', () => {
    for (const k of ['gptbot', 'claudebot', 'ccbot', 'perplexity', 'chatgptUser', 'ahrefs', 'bytespider'] as const) {
      expect(isLightPageBot(UA[k]), k).toBe(true);
    }
    expect(isLightPageBot('mozilla/5.0 (compatible; gptbot/1.0)')).toBe(true);
    expect(isLightPageBot([UA.chrome, UA.ccbot])).toBe(true);
  });
});

describe('robots.txt', () => {
  const txt = buildRobotsTxt('https://www.example.com');

  it('AI tarayıcıları tek grupta tüm siteden engellenir; * grubu ve Sitemap aynen kalır', () => {
    const [aiGroup, ...rest] = txt.split('\n\n');
    expect(aiGroup!.split('\n')).toEqual([...ROBOTS_BLOCKED_AI_AGENTS.map((a) => `User-agent: ${a}`), 'Disallow: /']);
    for (const a of ['GPTBot', 'ClaudeBot', 'CCBot', 'PerplexityBot']) expect(aiGroup).toContain(`User-agent: ${a}\n`);
    const tail = rest.join('\n\n');
    expect(tail).toContain('User-agent: *\nAllow: /');
    expect(tail).toContain('Disallow: /api/');
    expect(tail).toContain('Sitemap: https://www.example.com/sitemap.xml');
  });

  it('arama motorları engellenmez', () => {
    for (const a of ['Googlebot', 'Bingbot', 'YandexBot', 'Applebot']) expect(txt).not.toMatch(new RegExp(`^User-agent: ${a}$`, 'im'));
  });
});
