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
import { isPremiumUser } from '@/lib/premium';
import { CREDIT_PACKAGES, PREMIUM_CREDIT_THRESHOLD } from '@/config/creditPackages';

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

  it('premium (ADMIN) kullanıcıda reklam ve sponsor alanı HİÇ render edilmez', () => {
    state.status = 'authenticated';
    state.role = 'ADMIN';
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
    expect(renderToStaticMarkup(<SponsorSlider />)).toBe('');
  });

  it('oturum yüklenirken render edilmez (premium kullanıcıda titreme olmasın)', () => {
    state.status = 'loading';
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
  });

  it('bakiye ≥ en büyük paket → premium: reklam/sponsor yok; bir eksik → reklam var', () => {
    state.status = 'authenticated';
    state.role = 'USER';
    state.credits = PREMIUM_CREDIT_THRESHOLD;
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toBe('');
    state.credits = PREMIUM_CREDIT_THRESHOLD - 1;
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toContain('Reklam');
  });

  it('isPremiumUser: ADMIN her zaman; USER yalnızca eşikte ve üstünde; eşik = en büyük paket', () => {
    expect(isPremiumUser({ role: 'ADMIN', credits: 0 })).toBe(true);
    expect(isPremiumUser({ role: 'USER', credits: PREMIUM_CREDIT_THRESHOLD })).toBe(true);
    expect(isPremiumUser({ role: 'USER', credits: PREMIUM_CREDIT_THRESHOLD - 1 })).toBe(false);
    expect(isPremiumUser({ role: 'USER', credits: 5 })).toBe(false);
    expect(isPremiumUser({ role: undefined })).toBe(false);
    expect(isPremiumUser(null)).toBe(false);
    expect(PREMIUM_CREDIT_THRESHOLD).toBe(Math.max(...CREDIT_PACKAGES.map((p) => p.credits)));
  });
});
