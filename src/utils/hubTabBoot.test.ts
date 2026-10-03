import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HUB_TAB_ATTR, HUB_TAB_BOOT_SCRIPT, clearHubTabBoot, hubTabFromSearch } from './hubTabBoot';

/** Satır içi betiği sahte location / document ile çalıştırır. */
function runBoot(pathname: string, search: string): string | null {
  const attrs = new Map<string, string>();
  const documentElement = { setAttribute: (k: string, v: string) => void attrs.set(k, v) };
  new Function('location', 'document', 'URLSearchParams', HUB_TAB_BOOT_SCRIPT)({ pathname, search }, { documentElement }, URLSearchParams);
  return attrs.get(HUB_TAB_ATTR) ?? null;
}

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

describe('?tab= ön-boyama', () => {
  it('betik: ana sayfada geçerli sekme <html data-hub-tab>; diğer durumlarda öznitelik yok', () => {
    expect(runBoot('/', '?tab=live')).toBe('live');
    expect(runBoot('/', '?date=2026-10-03&tab=finished')).toBe('finished');
    expect(runBoot('/', '?tab=favorites&panel=leagues')).toBe('favorites');
    expect(runBoot('/', '?tab=all')).toBeNull();
    expect(runBoot('/', '?tab=xyz')).toBeNull();
    expect(runBoot('/', '')).toBeNull();
    expect(runBoot('/profile', '?tab=live')).toBeNull();
  });

  it('betik ile TS kuralı aynı', () => {
    for (const [p, q] of [['/', '?tab=live'], ['/', '?tab=all'], ['/', '?tab=x'], ['/teams/1', '?tab=live'], ['/', '?tab=favorites']]) {
      expect(runBoot(p, q)).toBe(hubTabFromSearch(p, q));
    }
  });

  it('hydration sekmeyi uygulayınca öznitelik kalkar; henüz "Hepsi" iken kalır', () => {
    const attrs = new Map([[HUB_TAB_ATTR, 'live']]);
    const root = { getAttribute: (n: string) => attrs.get(n) ?? null, removeAttribute: (n: string) => void attrs.delete(n) };
    clearHubTabBoot('all', root);
    expect(attrs.get(HUB_TAB_ATTR)).toBe('live');
    clearHubTabBoot('live', root);
    expect(attrs.has(HUB_TAB_ATTR)).toBe(false);
  });

  it('CSS: sekme / çip / alt menü öznitelikle seçili, liste gizli (yeri korunur) ve 5 sn güvenlik', () => {
    const sub = read('src/components/SubHeader/subHeader.module.scss');
    expect(sub).toMatch(/:global\(html\[data-hub-tab\]\) \.tab\[data-tab='all'\]/);
    expect(sub).toMatch(/:global\(html\[data-hub-tab='#\{\$tab\}'\]\) \.tab\[data-tab='#\{\$tab\}'\]/);
    const hub = read('src/pages/index.module.scss');
    expect(hub).toMatch(/:global\(html\[data-hub-tab\]\) \.hubList \{\s*visibility: hidden;\s*animation: hubTabBootReveal 0s linear 5s forwards;/);
    expect(hub).toMatch(/\.statusChip\[data-tab='#\{\$tab\}'\]/);
    expect(read('src/components/BottomNav/bottomNav.module.scss')).toMatch(/\.item\[data-nav-key='#\{\$key\}'\]/);
    expect(read('src/components/SubHeader/index.tsx')).toContain('data-tab={tab.key}');
    expect(read('src/components/MatchHubPage/index.tsx')).toMatch(/<script dangerouslySetInnerHTML=\{\{ __html: HUB_TAB_BOOT_SCRIPT \}\} \/>\s*<SubHeader/);
  });
});
