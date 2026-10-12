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

  it('stil: liste kendi içinde kayar — düğme / sezon satırı sabit, sheet kalan alanı alıp kayar; mobilde kaydırma kabı gövde', () => {
    const scss = readFileSync(path.join(process.cwd(), 'src/components/HubLeaguePicker/hubLeaguePicker.module.scss'), 'utf8');
    const desktop = scss.slice(0, scss.indexOf('@include below-desktop'));
    const mobile = scss.slice(scss.indexOf('@include below-desktop'));
    expect(desktop).toMatch(/\.picker \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;/);
    expect(desktop).toMatch(/\.bar \{[^}]*flex: 0 0 auto;/);
    expect(desktop).toMatch(/\.sheet \{[^}]*flex: 1 1 auto;[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(mobile).toMatch(/\.sheet \{[^}]*overflow: visible;/);
    expect(mobile).toMatch(/\.sheetBody \{[^}]*overflow-y: auto;/);
  });

  it('stil: ana sayfa paneli masaüstünde orta / sağ sütunlarla aynı tavanda (seçici açık ya da kapalı, sayfa uzamaz)', () => {
    const page = readFileSync(path.join(process.cwd(), 'src/pages/index.module.scss'), 'utf8');
    expect(page).toMatch(/@media \(min-width: \$bp-desktop\) \{\s*\.sidebar \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*max-height: \$hub-fill-height;/);
    expect(page).toMatch(/\.sidebarContent \{\s*flex: 1 1 auto;\s*min-height: 0;[^}]*overflow-y: auto;/);
    const hub = readFileSync(path.join(process.cwd(), 'src/components/MatchHubPage/index.tsx'), 'utf8');
    expect(hub).not.toContain('sidebarPickerOpen');
    // Seçici kapalıyken küçülmez (lig düğmesi satırı sıkışmasın), açıkken liste kalan alanda kayar
    const scss = readFileSync(path.join(process.cwd(), 'src/components/HubLeaguePicker/hubLeaguePicker.module.scss'), 'utf8');
    expect(scss).toMatch(/\.picker \{[^}]*flex: 0 0 auto;\s*&\[data-open\] \{\s*flex-shrink: 1;/);
    expect(render(true)).toMatch(/class="[^"]*picker[^"]*" data-open="true"/);
    expect(render(false)).not.toContain('data-open');
  });

  it('ana sayfa: kupa fikstürü modunda çipler seçili görünmez; çip / "+ Ligler" önce fikstür modundan çıkar, sonra filtreyi uygular', () => {
    const hub = readFileSync(path.join(process.cwd(), 'src/components/MatchHubPage/index.tsx'), 'utf8');
    expect(hub).toMatch(/noActive=\{uefaFixtureMode\}/);
    expect(hub).toMatch(/onSelectMode=\{\(mode\) => \{\s*if \(uefaFixtureMode\) exitFixtureMode\(\);\s*leagueFilter\.selectMode\(mode\);/);
    expect(hub).toMatch(/onApplyCustom=\{\(picked\) => \{\s*if \(uefaFixtureMode\) exitFixtureMode\(\);\s*leagueFilter\.applyCustom\(picked\);/);
    // "Günlük maçlara dön" ile aynı işlev
    expect(hub).toMatch(/onClick=\{exitFixtureMode\}/);
  });
});

