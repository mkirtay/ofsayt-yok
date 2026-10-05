import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MatchStats from '@/components/MatchStats';
import EventTimeline from '@/components/EventTimeline';
import MatchCard from '@/components/MatchCard';
import type { Match, MatchStateCode } from '@/models/liveScore';

// Evre bileşen içinde saklanmaz, her render'da match.status'tan türetilir: canlı güncelleme durumu değiştirince
// (PRE → LIVE) metinler sayfa yenilenmeden değişir. Burada her evrenin metni ayrı render ile doğrulanır.
const match = (status: string, extra: Partial<Match> & { state_code?: MatchStateCode } = {}): Match =>
  ({
    id: 19745050,
    status,
    time: '',
    date: '2026-10-02',
    scheduled: '18:30',
    home: { id: 1, name: 'Eldense' },
    away: { id: 2, name: 'Real Oviedo' },
    ...extra,
  }) as Match;

const stats = (m: Match, data: Record<string, string> | null = null) =>
  renderToStaticMarkup(<MatchStats stats={data as never} match={m} />);
const events = (m: Match, list: unknown[] = []) =>
  renderToStaticMarkup(<EventTimeline events={list as never} match={m} />);

describe('maç evresine göre kart metinleri', () => {
  it('başlamadı: 08 kartı + ilk düdük (SSR: sabit tarih, geri sayım yok) ve olay bekleme metni — yükleniyor beklenmez', () => {
    const html = renderToStaticMarkup(<MatchStats stats={null} loading match={match('NOT STARTED')} />);
    expect(html).toContain('Maç henüz başlamadı.');
    expect(html).toContain('İlk düdük: 2 Ekim Cuma, 21:30');
    expect(html).not.toContain('Başlamasına');
    const pre = renderToStaticMarkup(<EventTimeline events={[]} loading match={match('NOT STARTED')} />);
    expect(pre).toContain('Goller, kartlar ve oyuncu değişiklikleri maç başladığında burada görünecek.');
    // 10 kartı: başlık aynı, saat hapı / geri sayım yalnız istatistik kartında.
    expect(pre).toContain('Maç henüz başlamadı.');
    expect(pre).not.toContain('İlk düdük');
  });

  it('canlı, veri yok', () => {
    const live = match('IN PLAY', { scores: { score: '0-0' } } as Partial<Match>);
    expect(stats(live)).toContain('İstatistikler maç ilerledikçe burada görünecek.');
    expect(events(live)).toContain('Henüz önemli bir olay yok.');
  });

  it('bitti, veri yok', () => {
    const ft = match('FINISHED', { scores: { score: '1-0' } } as Partial<Match>);
    expect(stats(ft)).toContain('Bu maç için istatistik verisi sağlanmıyor.');
    expect(events(ft)).toContain('Bu maç için olay verisi sağlanmıyor.');
  });

  it('ertelendi: iki kartta da tek mesaj, maç öncesi kartı yok', () => {
    const pp = match('NOT STARTED', { state_code: 'POSTPONED' });
    for (const html of [stats(pp), events(pp)]) {
      expect(html).toContain('Maç ertelendi. Yeni tarih açıklandığında burada görünecek.');
      expect(html).not.toContain('Maç henüz başlamadı.');
    }
  });

  it('yarıda kaldı: veri varsa veri + üstte durum satırı', () => {
    const ab = match('FINISHED', { state_code: 'ABANDONED', scores: { score: '1-1' } } as Partial<Match>);
    const html = stats(ab, { possession: '55:45' });
    expect(html).toContain('Maç yarıda kaldı.');
    expect(html).toContain('55');
  });

  it('maç bilgisi verilmezse eski genel metin', () => {
    expect(renderToStaticMarkup(<EventTimeline events={[]} />)).toContain('Maç olayı bulunmuyor.');
  });
});

const card = (m: Match) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MatchCard match={m} />
    </QueryClientProvider>,
  );

describe('maç kartı skor alanı', () => {
  it('başlamadı: "? – ?" yerine saat + sabit gün (SSR), hakem "Açıklanmadı"', () => {
    const html = card(match('NOT STARTED'));
    expect(html).toContain('21:30');
    expect(html).toContain('2 Ekim Cuma');
    expect(html).not.toContain('Yarın');
    expect(html).not.toContain('?');
    expect(html).toContain('Açıklanmadı');
  });

  it('ertelendi: skor yerinde durum; eski tarih skorun altında üstü çizili (başlıkta tarih yok)', () => {
    const html = card(match('NOT STARTED', { state_code: 'POSTPONED' }));
    expect(html).toMatch(/scoreState[^>]*>Ertelendi</);
    expect(html).toMatch(/<s[^>]*>02\.10\.2026 · 21:30<\/s>/);
    expect(html).not.toMatch(/Tarih\s*:/);
  });

  it('iptal / tarih belirsiz: skor yerinde durum, eski tarih üstü çizili', () => {
    for (const code of ['CANCELLED', 'TBA'] as const) {
      const html = card(match(code === 'TBA' ? 'NOT STARTED' : 'FINISHED', { state_code: code }));
      expect(html).toMatch(/scoreState/);
      expect(html).toMatch(/<s[^>]*>02\.10\.2026 · 21:30<\/s>/);
    }
  });

  it('normal maçta tarih üstü çizili değil', () => {
    expect(card(match('NOT STARTED'))).not.toContain('<s ');
  });
});
