import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
const hub = read('src/pages/index.module.scss');
const block = hub.slice(hub.indexOf('.hubGridWithPanel {'), hub.indexOf('@media (min-width: $bp-gundem-panel)'));
const noComments = (s: string) => s.replace(/\/\/.*$/gm, '');

describe('ana sayfa split-view yükseklik mimarisi (MatchDetailPanel modeli)', () => {
  it('tek yükseklik kaynağı `$hub-fill-height` (100vh yalnızca orada); detay paneli grid\'i onu kullanır', () => {
    expect(noComments(hub).match(/100vh/g)).toHaveLength(1);
    expect(hub).toMatch(/\$hub-fill-height:\s*calc\(100vh/);
    expect(block).toMatch(/\.hubGridWithPanel\s*\{[^}]*height:\s*\$hub-fill-height/);
    expect(hub).not.toContain('--hub-col-h');
  });

  it('üç sütun da ebeveynden height:100% alır ve içeriğini kendi overflow-y:auto\'suyla kaydırır', () => {
    expect(block).toMatch(/\.hubSidebar,\s*\.hubMain\s*\{[^}]*height:\s*100%/);
    expect(block).toMatch(/\.hubList,\s*\.hubDetail\s*\{[^}]*height:\s*100%/);
    expect(block).toMatch(/\.sidebarContent\s*\{[^}]*overflow-y:\s*auto/);
    expect(block).toMatch(/\.hubList\s*\{[^}]*overflow-y:\s*auto/);
    const panel = read('src/components/MatchDetailPanel/matchDetailPanel.module.scss');
    expect(panel).toMatch(/\.panel\s*\{[^}]*height:\s*100%/);
    expect(panel).toMatch(/\.scroll\s*\{[^}]*overflow-y:\s*auto/);
  });

  it('sanallaştırılmış liste `fill` modunda vh yerine ebeveyn yüksekliğini kullanır', () => {
    const list = read('src/components/MatchList/matchList.module.scss');
    expect(list).toMatch(/\.virtualHostFill\s*\{[^}]*height:\s*100%/);
  });

  it('sidebar genişliği eski değerlerde (240px split/widget, 320px masaüstü); `--hub-sidebar-w` yok', () => {
    expect(hub).not.toContain('--hub-sidebar-w');
    expect(hub).toContain('grid-template-columns: 320px minmax(0, 1fr)');
    expect(hub).toContain('grid-template-columns: 240px minmax(0, 1fr);');
    expect(hub).not.toContain('grid-template-columns: 240px minmax(0, 1fr) 300px'); // sağ widget sütunu kaldırıldı
    expect(hub).not.toMatch(/hubGridWithRight|bp-widget|hub-right/);
  });

  it('idle Gündem: ≥$bp-gundem-panel\'de liste + Gündem aynı sabit yükseklikte (hizalı), ikisi de kendi içinde kayar; sidebar/hubGridWithPanel etkilenmez', () => {
    const idle = noComments(hub.slice(hub.indexOf('@media (min-width: $bp-gundem-panel)')));
    expect(idle).toMatch(/\.hubGridWithGundem \.hubMain\s*\{[^}]*height:\s*\$hub-fill-height/);
    expect(idle).toMatch(/\.hubList\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/);
    expect(idle).toMatch(/\.hubGundem\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/);
    expect(idle).not.toMatch(/position:\s*sticky/);
    expect(idle).not.toContain('hubGridWithPanel');
    expect(idle).not.toContain('hubSidebar'); // sol panel mevcut davranışında
  });

  it('geniş ekran: kap en fazla 1440 px ve ortalı (daha genişte düzen 1440\'taki gibi); Gündem sabit 360 px', () => {
    expect(hub).toMatch(/\.hubShell\s*\{[^}]*max-width:\s*1440px;[^}]*margin:\s*0 auto/);
    expect(hub).not.toContain('1680px');
    const idle = noComments(hub.slice(hub.indexOf('@media (min-width: $bp-gundem-panel)')));
    expect(idle).toMatch(/\.hubGundem\s*\{[^}]*flex:\s*0 0 360px;/);
    // 1440 altı kurallar (sidebar 240/320, detay paneli listesi) aynı
    expect(hub).toContain('flex: 0 0 clamp(440px, 46%, 520px);');
  });
});
