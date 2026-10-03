import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LOCKED_SECTION_CLASS, analysisPaywallJsonLd } from './analysisPaywall';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }));

import LockedPreview from '@/components/MatchAnalysis/LockedPreview';

describe('ücretli içerik işaretlemesi (SEO)', () => {
  it('Article + isAccessibleForFree false + hasPart.cssSelector', () => {
    expect(analysisPaywallJsonLd({ homeTeamName: 'A', awayTeamName: 'B', url: 'https://x/m' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'A – B AI maç analizi',
      url: 'https://x/m',
      publisher: { '@type': 'Organization', name: 'Ofsayt Yok' },
      isAccessibleForFree: false,
      hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.ai-analysis-locked' },
    });
  });

  it('seçici, kilitli kartın HTML\'indeki öğeyle eşleşir', () => {
    const html = renderToStaticMarkup(
      <LockedPreview
        preview={{ homeTeamName: 'A', awayTeamName: 'B', summary: [], top: null }}
        offer={null}
        loading={false}
        busy={false}
        error={null}
        isAuthenticated={false}
        onUnlock={() => {}}
      />,
    );
    expect(html).toMatch(new RegExp(`class="[^"]*\\b${LOCKED_SECTION_CLASS}\\b`));
  });
});
