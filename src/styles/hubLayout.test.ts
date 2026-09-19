import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
const hub = read('src/pages/index.module.scss');
const block = hub.slice(hub.indexOf('.hubGridWithPanel {'), hub.indexOf('@media (min-width: $bp-widget)'));

describe('ana sayfa split-view yükseklik mimarisi (MatchDetailPanel modeli)', () => {
  it('tek yükseklik kaynağı ortak parent: `.hubGridWithPanel { height: calc(100vh …) }`; sütunlarda ayrı vh hesabı yok', () => {
    expect(block).toMatch(/\.hubGridWithPanel\s*\{[^}]*height:\s*calc\(100vh/);
    expect(block.match(/100vh/g)).toHaveLength(1);
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
    expect(hub).toContain('grid-template-columns: 240px minmax(0, 1fr) 300px');
  });
});
