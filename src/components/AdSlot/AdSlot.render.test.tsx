import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({
  enabled: false,
  status: 'unauthenticated' as string,
  role: undefined as string | undefined,
  credits: 0,
  premiumUntil: null as string | null,
}));
vi.mock('@/config/ads', () => ({
  get ADS_ENABLED() {
    return state.enabled;
  },
}));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: state.status, data: state.status === 'authenticated' ? { user: { role: state.role, credits: state.credits, premiumUntil: state.premiumUntil } } : null }),
}));

import AdSlot from './index';
import SponsorSlider from '@/components/SponsorSlider';
import { analysisIsFree, isAdminUser, isPremiumUser } from '@/lib/premium';

beforeEach(() => {
  state.enabled = true;
  state.status = 'unauthenticated';
  state.role = undefined;
  state.credits = 0;
  state.premiumUntil = null;
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

  it('premium = premiumUntil gelecekte: reklam ve sponsor gizlenir; süresi geçmiş premium reklam görür', () => {
    state.status = 'authenticated';
    state.role = 'USER';
    state.premiumUntil = new Date(Date.now() + 86_400_000).toISOString();
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
    expect(renderToStaticMarkup(<SponsorSlider />)).toBe('');
    state.premiumUntil = new Date(Date.now() - 1_000).toISOString();
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toContain('Reklam');
  });

  it('isPremiumUser / isAdminUser / analysisIsFree (kredi modeli v2)', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(isPremiumUser({ premiumUntil: '2026-10-04T00:00:00Z' }, now)).toBe(true);
    expect(isPremiumUser({ premiumUntil: new Date('2026-10-03T11:59:59Z') }, now)).toBe(false);
    for (const u of [{ role: 'ADMIN' }, { role: 'USER', premiumUntil: null }, { premiumUntil: 'bozuk' }, null]) {
      expect(isPremiumUser(u, now)).toBe(false);
    }
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true);
    expect(isAdminUser({ role: 'USER', premiumUntil: '2027-01-01' })).toBe(false);
    expect(analysisIsFree({ role: 'ADMIN' }, now)).toBe(true);
    expect(analysisIsFree({ role: 'USER', premiumUntil: '2026-11-01' }, now)).toBe(true);
    expect(analysisIsFree({ role: 'USER' }, now)).toBe(false);
    expect(analysisIsFree(null)).toBe(false);
  });
});
