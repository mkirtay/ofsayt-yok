import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TeamTierBadge from './index';

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => ({ 'tier.superLig': 'Süper Lig', 'tier.firstLeague': '1. Lig', 'tier.secondLeague': '2. Lig' })[k] ?? k,
  }),
}));

const cup = { competition: { id: 606 }, date: '2026-10-06' } as never;
const tiers = { tiers: { '1': 1283, '2': 603 }, validFrom: '2026-07-01' };

describe('<TeamTierBadge />', () => {
  it('kupa maçında kısa kademe basar ("2. Lig Kırmızı" değil "2. Lig")', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
    expect(renderToStaticMarkup(<TeamTierBadge match={cup} teamId={1} tiers={tiers} />)).toContain('>2. Lig<');
    expect(renderToStaticMarkup(<TeamTierBadge match={cup} teamId={2} tiers={tiers} />)).toContain('>1. Lig<');
    vi.unstubAllEnvs();
  });

  it('bilinmeyen takımda hiçbir şey basmaz', () => {
    vi.stubEnv('NEXT_PUBLIC_SPORTMONKS_ENABLED', 'true');
    expect(renderToStaticMarkup(<TeamTierBadge match={cup} teamId={3} tiers={tiers} />)).toBe('');
    vi.unstubAllEnvs();
  });
});
