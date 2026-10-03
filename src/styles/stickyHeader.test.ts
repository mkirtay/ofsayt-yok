import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

describe('yapışık header', () => {
  it('html/body overflow-x: clip (hidden kaydırma kabı yapıp sticky\'yi bozuyordu); hidden yalnız eski tarayıcı yedeği', () => {
    const g = read('src/styles/globals.scss');
    expect(g).toMatch(/html,\s*body \{[^}]*overflow-x: hidden;[^}]*overflow-x: clip;/);
    expect(read('src/components/SubHeader/subHeader.module.scss')).not.toMatch(/overflow-x: clip;/);
  });

  it('header sticky top 0, yüksekliği tek değişkende (--header-height)', () => {
    const h = read('src/components/Header/header.module.scss');
    expect(h).toMatch(/\.header \{[^}]*height: var\(--header-height\);[^}]*position: sticky;\s*top: 0;\s*z-index: 100;/);
  });

  it('kaydırma hedefleri başlığın altında: scroll-padding-top = header + yapışık şerit', () => {
    expect(read('src/styles/globals.scss')).toMatch(/html \{\s*scroll-padding-top: calc\(var\(--header-height\) \+ var\(--sticky-top-extra, 0px\)/);
  });

  it('diğer yapışık öğeler header\'ın altında (top var(--header-height) ile)', () => {
    expect(read('src/components/SubHeader/subHeader.module.scss')).toMatch(/position: sticky;\s*top: var\(--header-height\);/);
    expect(read('src/components/GundemHubPage/gundemHubPage.module.scss')).toMatch(/position: sticky;[\s\S]{0,40}top: calc\(var\(--header-height\) \+/);
    expect(read('src/components/Profile/profile.module.scss')).toMatch(/top: calc\(var\(--header-height\) \+/);
  });

  it('yükleme şeridi header\'ın alt kenarında; header gizliyken (mobil ana sayfa) ekran kenarında', () => {
    const r = read('src/components/RouteProgress/RouteProgress.module.scss');
    expect(r).toMatch(/\.root \{\s*position: fixed;\s*top: calc\(var\(--header-height\) - 7\.5px\);/);
    expect(r).toMatch(/:global\(html\[data-chrome-hidden\]\) \.root \{\s*top: -4\.5px;/);
  });
});
