import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/components/TeamDetailView', () => ({
  default: ({ teamId, variant }: { teamId: string; variant: string }) => <div data-testid="view" data-team={teamId} data-variant={variant} />,
}));

import TeamDetailPanel from './index';

describe('<TeamDetailPanel />', () => {
  const html = renderToStaticMarkup(<TeamDetailPanel teamId="13860" onClose={() => {}} />);

  it('panel varyantıyla TeamDetailView\'i saran MatchDetailPanel modeli (bar + kaydırılan .scroll)', () => {
    expect(html).toContain('aria-label="Takım detayı"');
    expect(html).toContain('data-variant="panel"');
    expect(html).toContain('data-team="13860"');
    expect(html).toMatch(/class="_bar_\w+"/);
    expect(html).toMatch(/class="_scroll_\w+"/);
  });

  it('"Detaylı Görünüm" tam sayfa /teams/{id}\'ye gider; kapatma düğmesi var', () => {
    expect(html).toContain('href="/teams/13860"');
    expect(html).toContain('Detaylı Görünüm');
    expect(html).toContain('aria-label="Detay panelini kapat"');
  });
});
