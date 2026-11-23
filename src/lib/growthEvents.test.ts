import { afterEach, describe, expect, it, vi } from 'vitest';

const track = vi.fn();
vi.mock('@vercel/analytics', () => ({ track: (...a: unknown[]) => track(...a) }));

import { trackGrowth } from './growthEvents';
import { CONSENT_STORAGE_KEY } from './analyticsConsent';

function setWindow(consent: string | null) {
  const gtag = vi.fn();
  const store = new Map<string, string>(consent ? [[CONSENT_STORAGE_KEY, consent]] : []);
  vi.stubGlobal('window', { gtag, localStorage: { getItem: (k: string) => store.get(k) ?? null } });
  return gtag;
}

afterEach(() => {
  vi.unstubAllGlobals();
  track.mockReset();
});

describe('trackGrowth — GA yalnız güncel onayla', () => {
  const params = { slot: 'next_card', referee_id: 80234, match_id: 19873236 } as const;

  it('onay varsa: GA ve Vercel tek tıklamada birer kez, hakem + maç kimliğiyle', () => {
    const gtag = setWindow('granted');
    trackGrowth('referee_match_click', params);
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'referee_match_click', params);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('onay reddedilmiş ya da sorulmamışsa GA çağrılmaz (gtag sayfada kalmış olsa bile); çerezsiz Vercel sayımı sürer', () => {
    for (const c of ['denied', null]) {
      const gtag = setWindow(c);
      trackGrowth('referee_match_click', params);
      expect(gtag).not.toHaveBeenCalled();
    }
    expect(track).toHaveBeenCalledTimes(2);
  });
});
