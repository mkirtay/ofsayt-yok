import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionContext } from 'next-auth/react';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'tr' }),
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => `${k}:${o?.views}/${o?.comments}` }),
}));

import MatchCountersBadge from './index';
import { countsFor, useCanSeeMatchCounters, useMatchCounters } from '@/hooks/useMatchCounters';

describe('<MatchCountersBadge />', () => {
  it('"👁 753 · 💬 18" + erişilebilir etiket', () => {
    const html = renderToStaticMarkup(<MatchCountersBadge counts={{ views: 753, comments: 18 }} />);
    expect(html).toContain('👁 753');
    expect(html).toContain('💬 18');
    expect(html).toContain('aria-label="counters.label:753/18"');
  });
  it('sayı yoksa hiçbir şey çizmez', () => {
    expect(renderToStaticMarkup(<MatchCountersBadge counts={null} />)).toBe('');
  });
});

describe('countsFor', () => {
  it('harita yoksa null, maç yoksa sıfır', () => {
    expect(countsFor(null, '1')).toBeNull();
    expect(countsFor({}, '1')).toEqual({ views: 0, comments: 0 });
    expect(countsFor({ '1': { views: 3, comments: 1 } }, 1)).toEqual({ views: 3, comments: 1 });
  });
});

function Probe() {
  const can = useCanSeeMatchCounters();
  const map = useMatchCounters(['1', '2']);
  return <i data-can={String(can)} data-map={map === null ? 'null' : 'set'} />;
}

function withSession(role: string | null) {
  const value = role
    ? { data: { user: { id: 'x', role }, expires: '' }, status: 'authenticated' as const, update: async () => null }
    : { data: null, status: 'unauthenticated' as const, update: async () => null };
  return renderToStaticMarkup(
    <SessionContext.Provider value={value as never}>
      <Probe />
    </SessionContext.Provider>,
  );
}

describe('useCanSeeMatchCounters', () => {
  it('yalnız ADMIN; SessionProvider olmadan da atmaz', () => {
    expect(withSession('ADMIN')).toContain('data-can="true"');
    expect(withSession('USER')).toContain('data-can="false"');
    expect(withSession(null)).toContain('data-can="false"');
    expect(renderToStaticMarkup(<Probe />)).toContain('data-can="false"');
  });
  it('yetkisizde sayı haritası hep null (istek yok)', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(withSession('USER')).toContain('data-map="null"');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
