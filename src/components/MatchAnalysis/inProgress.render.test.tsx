import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatchAnalysisState } from '@/hooks/useMatchAnalysis';

vi.mock('@/components/KuralKosesi/DailyFactCard', () => ({ default: () => null }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'u' } } }) }));

import MatchAnalysis from './index';

const base = {
  analysis: null, predictionRecord: null, serverPhase: 'PRE', loading: false, generating: false, inProgress: false,
  error: null, credits: 90, unlimited: false, isAuthenticated: true, generate: async () => {},
};
const render = (s: Partial<MatchAnalysisState>) =>
  renderToStaticMarkup(<MatchAnalysis match={null} state={{ ...base, ...s } as MatchAnalysisState} />);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('AI analizi — başka istek üretirken (409)', () => {
  it('"üretiliyor, birkaç saniye içinde hazır" görünür; hata kutusu ve üretim düğmesi yok', () => {
    const html = render({ inProgress: true });
    expect(text(html)).toContain('Bu maçın analizi şu an üretiliyor — birkaç saniye içinde hazır olacak.');
    expect(html).not.toContain('errorBox');
    expect(text(html)).not.toContain('AI ile Analiz Et');
  });

  it('kendi üretimi sürerken eski metin', () => {
    expect(text(render({ generating: true }))).toContain('AI analizi hazırlanıyor');
  });

  it('yoklama süresi dolarsa yumuşak uyarı + düğme (kredi düşmediği söylenir)', () => {
    const t = text(render({ error: 'Analiz hâlâ hazırlanıyor. Birazdan tekrar deneyebilirsin; kredin düşmedi.' }));
    expect(t).toContain('kredin düşmedi');
    expect(t).toContain('AI ile Analiz Et');
  });
});
