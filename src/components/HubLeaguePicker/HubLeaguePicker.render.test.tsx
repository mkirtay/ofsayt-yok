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

  it('sezon alanı: lig düğmesinin yanında "SEZON" etiketi + seçici; liste yokken yükleniyorsa kapalı yer tutucu, yoksa çizilmez', () => {
    const seasons = [{ id: 2, name: '2026/2027' }, { id: 1, name: '2025/2026' }];
    const html = renderToStaticMarkup(
      <HubLeaguePicker open={false} onOpenChange={() => {}} leagueName="Süper Lig" logoSrc={null} seasons={seasons} selectedSeasonId={1} onSeasonChange={() => {}}>
        <ul />
      </HubLeaguePicker>,
    );
    expect(html).toMatch(/<label class="[^"]*season[^"]*"><span[^>]*>Sezon<\/span><select[^>]*aria-label="[^"]*"/);
    expect(html).toContain('<option value="1" selected');
    expect(html).toContain('2026-2027');
    expect(html.indexOf('</button>')).toBeLessThan(html.indexOf('<label'));
    const pending = renderToStaticMarkup(
      <HubLeaguePicker open={false} onOpenChange={() => {}} leagueName="X" logoSrc={null} seasons={[]} onSeasonChange={() => {}} seasonsLoading>
        <ul />
      </HubLeaguePicker>,
    );
    expect(pending).toMatch(/<select[^>]*disabled/);
    const none = renderToStaticMarkup(
      <HubLeaguePicker open={false} onOpenChange={() => {}} leagueName="X" logoSrc={null} seasons={[]} onSeasonChange={() => {}}>
        <ul />
      </HubLeaguePicker>,
    );
    expect(none).not.toContain('<select');
  });

  it('stil: lig dropdown\'u kalan genişliği alır, sezon alanı içeriği kadar; dar kapsayıcıda sezon altta tek satır (container query)', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/HubLeaguePicker/hubLeaguePicker.module.scss'), 'utf8');
    expect(scss).toMatch(/container-type: inline-size/);
    expect(scss).toMatch(/\.trigger \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/);
    expect(scss).toMatch(/\.season \{[^}]*flex: 0 0 auto;[^}]*flex-direction: column;[^}]*height: 48px;/);
    expect(scss).toMatch(/@container \(max-width: 300px\)\s*{\s*flex: 1 1 100%;\s*flex-direction: row;/);
    expect(scss).toMatch(/\.seasonLabel \{[^}]*text-transform: uppercase;/);
  });
});
