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
    expect(text(html)).toContain('Bugünkü ücretsiz açma hakkını kullandın.');
    expect(text(html)).not.toContain('Bugünkü ücretsiz açma hakkını kullan ');
    // Önizleme de olasılık gösteriyor → bilgi amaçlı + 18+ uyarısı kilitli kartta da var.
    expect(text(html)).toContain('kesin sonuç vaat etmez. 18+');
  });

  it('haftalık hak varsa iki düğme; bakiye 0 → "Kredi Satın Al"; ücretsiz açma / yönetici tek düğme', () => {
    const weekly = render({ offer: offer({ weeklyFree: { available: true, reason: null } }) });
    expect(text(weekly)).toContain('Bugünkü ücretsiz açma hakkını kullan');
    expect(text(weekly)).toContain('1 krediyle aç');
    expect(text(render({ offer: offer({ balance: 0 }) }))).not.toContain('1 krediyle aç');
    // Bakiye 0: /pricing'e bağlantı değil, kredi popup'ını açan düğme (paket seçilince doğrudan ödeme).
    expect(render({ offer: offer({ balance: 0 }) })).toMatch(/<button type="button"[^>]*aria-haspopup="dialog"[^>]*>Kredi al</);
    expect(text(render({ offer: offer({ free: true }) }))).toContain('Ücretsiz aç'); // yönetici dışı kredisiz yol artık yok; görünüm yedeği
    expect(text(render({ offer: offer({ free: true, admin: true }) }))).toContain('Yönetici olarak aç');
  });

  it('girişsiz: "giriş yap" bağlantısı; SSR (teklif henüz yok) → önizleme yine görünür, düğme kapalı', () => {
    const anon = render({ isAuthenticated: false, offer: null });
    expect(anon).toContain('href="/auth/signup?src=analysis_lock"');
    expect(text(anon)).toContain('Üye ol, 2 kredi hediye');
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

describe('kilidin yanında kanıt (büyüme raporu 1.6)', () => {
  it('teklifte son 7 gün isabeti varsa satır + isabet sayfası bağlantısı; yoksa satır yok', () => {
    const withProof = text(render({ offer: offer({ proof: { hits: 40, picks: 51, matches: 17, days: 7 } }) }));
    expect(withProof).toContain('Son 7 günde öne çıkan 51 AI tahmininden 40 tanesi tuttu (%78,4).');
    expect(render({ offer: offer({ proof: { hits: 40, picks: 51, matches: 17, days: 7 } }) })).toContain('href="/ai-istatistikleri"');
    expect(text(render({}))).not.toContain('Son 7 günde');
  });
});
