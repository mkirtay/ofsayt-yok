import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BulkToolbar from './BulkToolbar';

const summary = { total: 7, kinds: [{ kind: 'GOAL', count: 5 }, { kind: 'RECAP', count: 2 }], leagues: [{ name: 'Süper Lig', count: 4 }] };
const noop = vi.fn();
const render = (o: Partial<Parameters<typeof BulkToolbar>[0]> = {}) =>
  renderToStaticMarkup(
    <BulkToolbar selectedCount={0} pageCount={3} summary={summary} kind="" league="" onKind={noop} onLeague={noop} onToggleAll={noop} onRejectSelected={noop} onRejectAll={noop} onRejectFiltered={noop} {...o} />,
  );

describe('BulkToolbar', () => {
  it('toplam sayı, tür/lig seçenekleri sayılarıyla gösterilir', () => {
    const html = render();
    expect(html).toContain('Tümünü reddet (7)');
    expect(html).toContain('Gol (5)');
    expect(html).toContain('Maç sonu (2)');
    expect(html).toContain('Süper Lig (4)');
    expect(html).toContain('Seçilenleri reddet (0)');
  });

  it('seçim yokken "Seçilenleri reddet" ve filtre yokken "Filtreye göre reddet" pasif', () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Seçilenleri reddet \(0\)/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Filtreye göre reddet/);
  });

  it('seçim ve filtre varsa düğmeler etkin; hepsi seçiliyse "Seçimi kaldır"', () => {
    const html = render({ selectedCount: 3, kind: 'GOAL' });
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Seçilenleri reddet \(3\)/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Filtreye göre reddet/);
    expect(html).toContain('Seçimi kaldır');
  });

  it('bekleyen yoksa "Tümünü reddet" pasif; işlem sürerken her şey pasif', () => {
    expect(render({ summary: { total: 0, kinds: [], leagues: [] } })).toMatch(/<button[^>]*disabled=""[^>]*>Tümünü reddet \(0\)/);
    expect(render({ busy: true, selectedCount: 1 })).toMatch(/<button[^>]*disabled=""[^>]*>Seçilenleri reddet \(1\)/);
  });
});
