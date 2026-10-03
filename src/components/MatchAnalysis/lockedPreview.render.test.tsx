import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AnalysisOffer, MatchAnalysisState } from '@/hooks/useMatchAnalysis';

vi.mock('@/components/KuralKosesi/DailyFactCard', () => ({ default: () => null }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'authenticated', data: { user: { id: 'u' } } }) }));

import MatchAnalysis from './index';
import MatchTabs from '@/components/MatchTabs';

/** Kredi modeli v2 — kilitli analiz kartı: önizleme + kilitli başlıklar + açma düğmeleri; kilitli içerik yok. */
const preview = {
  homeTeamName: 'Galatasaray',
  awayTeamName: 'Fenerbahçe',
  summary: ['Yüksek tempo bekleniyor.', 'Ev sahibi baskın.'],
  top: { outcome: 'HOME' as const, pct: 58 },
};
const offer = (o: Partial<AnalysisOffer> = {}): AnalysisOffer => ({
  cost: 1,
  signedIn: true,
  balance: 3,
  premium: false,
  admin: false,
  free: false,
  weeklyFree: { available: false, reason: 'USED' },
  ...o,
});
const base = {
  analysis: null, predictionRecord: null, serverPhase: 'PRE', loading: false, generating: false, inProgress: false,
  error: null, credits: 3, unlimited: false, isAuthenticated: true, generate: async () => {},
  preview, locked: true, offer: offer(),
};
const render = (s: Partial<MatchAnalysisState>) =>
  renderToStaticMarkup(<MatchAnalysis match={null} state={{ ...base, ...s } as MatchAnalysisState} />);
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('kilitli analiz kartı', () => {
  it('önizleme (özet + "Galatasaray kazanır %58") ve kilitli bölüm başlıkları; JSON-LD seçicisi sayfada', () => {
    const html = render({});
    expect(text(html)).toContain('Ücretsiz önizleme');
    expect(text(html)).toContain('Yüksek tempo bekleniyor.');
    expect(text(html)).toContain('Galatasaray kazanır %58');
    expect(html).toContain('ai-analysis-locked');
    for (const s of ['Olasılık senaryoları', 'Skor tahmini', 'Takım analizleri', 'Eksik oyuncu yorumu', 'Analist yorumu']) {
      expect(text(html)).toContain(s);
    }
    expect(text(html)).toContain('1 krediyle aç');
    expect(text(html)).toContain('Bu haftaki ücretsiz açma hakkını kullandın.');
    expect(text(html)).not.toContain('Bu haftaki ücretsiz açma hakkını kullan ');
  });

  it('haftalık hak varsa iki düğme; bakiye 0 → "Kredi Satın Al"; premium / yönetici tek düğme', () => {
    const weekly = render({ offer: offer({ weeklyFree: { available: true, reason: null } }) });
    expect(text(weekly)).toContain('Bu haftaki ücretsiz açma hakkını kullan');
    expect(text(weekly)).toContain('1 krediyle aç');
    expect(text(render({ offer: offer({ balance: 0 }) }))).not.toContain('1 krediyle aç');
    expect(render({ offer: offer({ balance: 0 }) })).toContain('href="/credits"');
    expect(text(render({ offer: offer({ free: true, premium: true }) }))).toContain('Premium ile aç');
    expect(text(render({ offer: offer({ free: true, admin: true }) }))).toContain('Yönetici olarak aç');
  });

  it('girişsiz: "giriş yap" bağlantısı; SSR (teklif henüz yok) → önizleme yine görünür, düğme kapalı', () => {
    const anon = render({ isAuthenticated: false, offer: null });
    expect(anon).toContain('href="/auth/signin"');
    const ssr = render({ offer: null, loading: true });
    expect(text(ssr)).toContain('Galatasaray kazanır %58');
    expect(ssr).toMatch(/<button[^>]*disabled=""[^>]*>1 krediyle aç/);
  });
});

describe('MatchTabs prerender', () => {
  it('açılmamış AI sekmesi ilk HTML\'de gizli çizilir; prerender yoksa çizilmez', () => {
    const tabs = [
      { key: 'overview' as const, label: 'Genel', render: () => <p>genel</p> },
      { key: 'analysis' as const, label: 'AI', render: () => <p>analiz-önizleme</p> },
    ];
    const withPre = renderToStaticMarkup(<MatchTabs tabs={tabs} active="overview" onChange={() => {}} ariaLabel="x" prerender={['analysis']} />);
    expect(withPre).toMatch(/<div[^>]*hidden=""[^>]*><p>analiz-önizleme<\/p>/);
    const without = renderToStaticMarkup(<MatchTabs tabs={tabs} active="overview" onChange={() => {}} ariaLabel="x" />);
    expect(without).not.toContain('analiz-önizleme');
  });
});
