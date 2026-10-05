import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import HubLeaguePicker from './index';

const render = (open: boolean) =>
  renderToStaticMarkup(
    <HubLeaguePicker open={open} onOpenChange={() => {}} leagueName="Süper Lig" logoSrc="https://cdn.sportmonks.com/images/soccer/leagues/24/600.png">
      <ul data-testid="list">
        <li>liste</li>
      </ul>
    </HubLeaguePicker>,
  );

describe('<HubLeaguePicker /> (yan panel lig seçici)', () => {
  it('kapalı: logo + ad + ▾ düğmesi, erişilebilir ad ve aria-expanded=false; liste çizilmez', () => {
    const html = render(false);
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"[^>]*aria-label="Ligi değiştir: Süper Lig"/);
    expect(html).toContain('>Süper Lig</span>');
    expect(html).toContain('▾');
    expect(html).toContain('600.png');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('liste');
  });

  it('açık: düğme listeyi denetler (aria-controls = dialog id), başlık ve kapat düğmesi, liste içeride', () => {
    const html = render(true);
    const controls = /aria-controls="([^"]+)"/.exec(html)![1]!;
    expect(html).toContain(`id="${controls}"`);
    expect(html).toMatch(/role="dialog"[^>]*aria-label="Lig seç"/);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Kapat"');
    expect(html).toContain('liste');
  });

  it('stil: mobilde tam ekran sheet (fixed, alt menünün üstünde), masaüstünde panel içinde', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/HubLeaguePicker/hubLeaguePicker.module.scss'), 'utf8');
    const mobile = scss.slice(scss.indexOf('@include below-desktop'));
    expect(mobile).toMatch(/\.sheet \{[^}]*position: fixed;[^}]*inset: 0;[^}]*z-index: 200;/);
    expect(scss.slice(0, scss.indexOf('@include below-desktop'))).not.toMatch(/position: fixed/);
  });
});
