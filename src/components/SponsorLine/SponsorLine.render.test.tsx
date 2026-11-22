import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const cfg = vi.hoisted(() => ({ s: { refereeReport: null as null | { name: string; url: string; label?: string }, predictionLeague: null } }));
vi.mock('@/config/sponsorSlots', () => ({ SPONSOR_SLOTS: cfg.s }));

import SponsorLine from './index';

describe('sponsor satırı (büyüme raporu 3.5)', () => {
  it('sponsor yokken hiçbir şey; varsa rel="sponsored" bağlantı', () => {
    expect(renderToStaticMarkup(<SponsorLine slot="refereeReport" />)).toBe('');
    cfg.s.refereeReport = { name: 'Marka', url: 'https://marka.example', label: 'katkılarıyla' };
    const html = renderToStaticMarkup(<SponsorLine slot="refereeReport" />);
    expect(html).toContain('rel="sponsored noopener noreferrer"');
    expect(html).toContain('Marka');
  });
});
