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
import { analysisIsFree, isAdminUser } from '@/lib/userRole';

beforeEach(() => {
  state.enabled = true;
  state.status = 'unauthenticated';
  state.role = undefined;
  state.credits = 0;
  state.premiumUntil = null;
});

describe('AdSlot / SponsorSlider — bayrak (premium kapısı yok)', () => {
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

  it('premium kaldırıldı: premiumUntil gelecekte olsa da reklam ve sponsor görünür', () => {
    state.status = 'authenticated';
    state.role = 'USER';
    state.premiumUntil = new Date(Date.now() + 86_400_000).toISOString();
    expect(renderToStaticMarkup(<AdSlot slot="x" />)).toContain('Reklam');
  });

  it('isAdminUser / analysisIsFree: muafiyet YALNIZ yönetici (premiumUntil ve bakiye muafiyet vermez)', () => {
    expect(isAdminUser({ role: 'ADMIN' })).toBe(true);
    expect(isAdminUser({ role: 'USER' })).toBe(false);
    expect(analysisIsFree({ role: 'ADMIN' })).toBe(true);
    expect(analysisIsFree({ role: 'USER', premiumUntil: '2099-01-01', credits: 500 } as { role: string })).toBe(false);
    expect(analysisIsFree({ role: 'USER' })).toBe(false);
    expect(analysisIsFree(null)).toBe(false);
  });
});
