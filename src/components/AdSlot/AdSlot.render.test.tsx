import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ enabled: false, status: 'unauthenticated' as string, role: undefined as string | undefined, credits: 0 }));
vi.mock('@/config/ads', () => ({
  get ADS_ENABLED() {
    return state.enabled;
  },
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: state.status, data: state.status === 'authenticated' ? { user: { role: state.role, credits: state.credits } } : null }),
}));

import AdSlot from './index';
import SponsorSlider from '@/components/SponsorSlider';
import { analysisIsFree, isAdminUser, isPremiumUser } from '@/lib/premium';

beforeEach(() => {
  state.enabled = true;
  state.status = 'unauthenticated';
  state.role = undefined;
  state.credits = 0;
});

describe('AdSlot / SponsorSlider — bayrak ve premium kapısı', () => {
  it('bayrak KAPALI (varsayılan) → hiçbir şey render edilmez', () => {
    state.enabled = false;
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
    expect(renderToStaticMarkup(<SponsorSlider />)).toBe('');
  });

  it('bayrak açık + ziyaretçi/normal kullanıcı → placeholder render edilir', () => {
    expect(renderToStaticMarkup(<AdSlot slot="hub-sidebar" />)).toContain('data-ad-slot="hub-sidebar"');
    state.status = 'authenticated';
    state.role = 'USER';
    expect(renderToStaticMarkup(<AdSlot slot="hub-sidebar" />)).toContain('Reklam');
    expect(renderToStaticMarkup(<SponsorSlider />)).toContain('Sponsorlar');
  });

  it('yönetici premium değil: reklam ve sponsor alanı görünür (reklam gizleme yalnızca premium\'a bağlı)', () => {
    state.status = 'authenticated';
    state.role = 'ADMIN';
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toContain('Reklam');
    expect(renderToStaticMarkup(<SponsorSlider />)).toContain('Sponsorlar');
  });

  it('oturum yüklenirken render edilmez (premium kullanıcıda titreme olmasın)', () => {
    state.status = 'loading';
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
  });

  it('bakiye premium yapmaz: 100+ kredili kullanıcı da reklam görür', () => {
    state.status = 'authenticated';
    state.role = 'USER';
    state.credits = 500;
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toContain('Reklam');
  });

  it('ödeme entegrasyonuna kadar kimse premium değil; yönetici ayrı, analizi kredisiz', () => {
    for (const u of [{ role: 'ADMIN', credits: 0 }, { role: 'USER', credits: 100 }, { role: 'USER', credits: 1000 }, { role: 'USER', credits: 5 }, null]) {
      expect(isPremiumUser(u)).toBe(false);
    }
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true);
    expect(isAdminUser({ role: 'USER', credits: 1000 })).toBe(false);
    expect(analysisIsFree({ role: 'ADMIN', credits: 0 })).toBe(true);
    expect(analysisIsFree({ role: 'USER', credits: 1000 })).toBe(false);
    expect(analysisIsFree(null)).toBe(false);
  });
});
