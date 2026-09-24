import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import profileFixture from '@/services/sportmonks/__fixtures__/playerProfileOsimhen.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';

const profile = mapPlayerProfile((profileFixture as unknown as { data: RawPlayer }).data);

const state = vi.hoisted(() => ({ profile: null as unknown, rows: [] as unknown[], trendRows: [] as unknown[], hasMore: false, loading: false }));
vi.mock('@/hooks/usePlayerProfile', async () => {
  const { buildRatingSeries, summarizeRatings } = await import('@/utils/ratingTrend');
  return {
    usePlayerProfile: () => ({ data: state.profile, isLoading: false }),
    usePlayerMatchHistory: () => ({ rows: state.rows, loading: state.loading, hasMore: state.hasMore, expand: () => {}, empty: false }),
    usePlayerRatingTrend: () => {
      const series = buildRatingSeries(state.trendRows as never);
      return { series, summary: summarizeRatings(series.points), loading: false, error: false };
    },
  };
});

import PlayerProfile, { ageFromBirth, formatTransferAmount, transferTypeLabel, formatPlayerDate } from './index';

const render = () => renderToStaticMarkup(<PlayerProfile playerId="455805" />);

const trendRows = [
  { matchId: 11, date: '2026-08-14', isHome: true, opponent: 'Çorum FK', score: '2-2', rating: 7.89 },
  { matchId: 12, date: '2026-08-21', isHome: false, opponent: 'Erzurumspor FK', opponentLogo: 'https://cdn.example/erz.png', score: '4-0', rating: 9.01 },
  { matchId: 13, date: '2026-08-29', isHome: true, opponent: 'Göztepe', score: '3-2', rating: 8.24 },
  { matchId: 14, date: '2026-09-04', isHome: false, opponent: 'İstanbul Başakşehir', score: '3-2', rating: 6.9 },
  { matchId: 15, date: '2026-09-09', isHome: false, opponent: 'Sporting CP', score: '0-1' },
  { matchId: 16, date: '2026-09-13', isHome: true, opponent: 'Kocaelispor', score: '1-0' },
  { matchId: 10, date: '2026-05-09', isHome: true, opponent: 'Antalyaspor', score: '4-2', rating: 7.51 },
];

describe('<PlayerProfile /> — gerçek Osimhen verisi', () => {
  state.profile = profile;
  state.trendRows = trendRows;
  state.rows = [
    { matchId: 1, date: '2026-09-04', isHome: false, opponent: 'İstanbul Başakşehir', score: '1-3', inSquad: true, started: true, minutes: 33, rating: 6.9, goals: 1 },
    { matchId: 2, date: '2026-09-13', isHome: true, opponent: 'Kocaelispor', score: '1-0', inSquad: false },
  ];
  state.hasMore = true;
  const html = render();

  it('bölümler: profil, sezon, detaylı istatistik, transfer, maç geçmişi', () => {
    for (const id of ['pp-bio', 'pp-season', 'pp-stats', 'pp-transfers', 'pp-matches']) expect(html).toContain(`id="${id}"`);
    expect(html).toContain('Victor Osimhen');
    expect(html).toContain('Nigeria');
    expect(html).toContain('Sağ'); // tercih edilen ayak
  });

  it('sezon özeti: maç/ilk 11/dakika/gol/asist/rating gerçek değerlerle', () => {
    expect(html).toMatch(/>4<\/span><span[^>]*>Maç</);
    expect(html).toMatch(/>303<\/span><span[^>]*>Dakika</);
    expect(html).toMatch(/>8\.02<\/span><span[^>]*>Rating</);
    expect(html).toContain('6.9 – 9.0'); // en düşük – en yüksek
    expect(html).toMatch(/data-tone="excellent"[^>]*>8\.02</); // sezon ortalaması reyting skalasıyla boyalı
  });

  it('detaylı istatistik grupları var (şut/pas/savunma/bireysel)', () => {
    for (const g of ['Şut &amp; Hücum', 'Pas', 'Bireysel']) expect(html).toContain(g);
    expect(html).toContain('Toplam şut');
  });

  it('transferler: tip etiketi Türkçe, kalıcı transferde bedel, kiralıkta "—"', () => {
    expect(html).toContain('Kiralık');
    expect(html).toContain('Kiralık dönüşü');
    expect(html).toContain('75 Mn');
    expect(html).toContain('Napoli');
  });

  it('maç geçmişi: oynamadığı maçta "Kadroda yok", oynadığında dakika/rating; "Tümünü Göster" (kalan varsa)', () => {
    expect(html).toContain('Kadroda yok');
    expect(html).toContain('6.9');
    expect(html).toMatch(/data-tone="fair"[^>]*>6\.9</); // maç reytingi rozeti (6.5–6.99 sarı-yeşil)
    expect(html).toContain('Tümünü Göster');
    expect(html).toContain('href="/matches/1"');
  });

  it('KAPSAM DIŞI bölümler hiç yok: xG/xGOT, piyasa değeri, kupa, radar, topluluk oyu, sosyal', () => {
    const t = html.toLowerCase();
    for (const bad of ['xg', 'piyasa', 'market', 'kupa', 'trofe', 'radar', 'haftanın oyuncu', 'en popüler', 'sosyal', 'ilişki']) {
      expect(t, bad).not.toContain(bad);
    }
  });

  it('takım linki /teams/{id}', () => {
    expect(html).toContain('href="/teams/34"');
  });

  it('maç geçmişi tümü gösterildiğinde buton yok', () => {
    state.hasMore = false;
    expect(render()).not.toContain('Tümünü Göster');
  });

  it('oyuncu yoksa EmptyState', () => {
    state.profile = null;
    const h = render();
    expect(h).toContain('role="status"');
    expect(h).toContain('Oyuncu bulunamadı');
    state.profile = profile;
  });
});

describe('yardımcılar', () => {
  it('ageFromBirth doğum günü öncesi/sonrası', () => {
    expect(ageFromBirth('1998-12-29', new Date('2026-09-19T00:00:00Z'))).toBe(27);
    expect(ageFromBirth('1998-12-29', new Date('2026-12-29T00:00:00Z'))).toBe(28);
    expect(ageFromBirth(undefined)).toBeNull();
    expect(ageFromBirth('bozuk')).toBeNull();
  });
  it('formatTransferAmount: null/0 → null ("Bilinmiyor" yazılmaz, "0" yazılmaz)', () => {
    expect(formatTransferAmount(75_000_000)).toBe('75 Mn');
    expect(formatTransferAmount(3_500_000)).toBe('3,5 Mn');
    expect(formatTransferAmount(null)).toBeNull();
    expect(formatTransferAmount(0)).toBeNull();
  });
  it('transferTypeLabel + formatPlayerDate (dil verilmezse Türkçe)', () => {
    expect(transferTypeLabel('Loan')).toBe('Kiralık');
    expect(transferTypeLabel('Other')).toBe('Other');
    expect(formatPlayerDate('2025-07-31')).toContain('2025');
    expect(formatPlayerDate(undefined)).toBe('—');
  });

  it('dil verilince tarih ve bedel o dile göre biçimlenir', () => {
    expect(formatPlayerDate('2025-07-31', 'en')).toContain('Jul');
    expect(formatPlayerDate('2025-07-31', 'tr')).toContain('Tem');
    const en = (k: string) => ({ 'transfers.million': 'M', 'transfers.thousand': 'K' })[k] ?? k;
    expect(formatTransferAmount(3_500_000, en, 'en')).toBe('3.5 M');
    expect(formatTransferAmount(75_000_000, en, 'en')).toBe('75 M');
  });
});

describe('<PlayerProfile /> — rating grafiği', () => {
  it('eski → yeni noktalar skala renginde, her nokta maça bağlantı + tam erişilebilir etiket', () => {
    state.profile = profile;
    state.trendRows = trendRows;
    const html = render();
    expect(html).toContain('id="pp-rating-trend"');
    expect(html).toContain('Son 5 maç');
    const points = [...html.matchAll(/<a href="\/matches\/(\d+)" aria-label="([^"]+)"[^>]*data-tone="(\w+)"/g)].map((m) => [m[1], m[3]]);
    expect(points).toEqual([['10', 'good'], ['11', 'good'], ['12', 'excellent'], ['13', 'excellent'], ['14', 'fair']]);
    expect(html).toContain('aria-label="4 Eyl 2026, Dep İstanbul Başakşehir, skor 3-2, rating 6.9"');
  });

  it('özet: ortalama, en iyi/en kötü, istikrar (≥5 maç), reytingsiz maç sayısı, ekran okuyucu özeti', () => {
    const html = render();
    expect(html).toMatch(/data-tone="good"[^>]*>7\.91</); // (7.51+7.89+9.01+8.24+6.9)/5 → 7.0–7.99 yeşil
    expect(html).toContain('Ort. 7.91');
    expect(html).toMatch(/data-testid="rating-consistency"[^>]*>Dalgalı/); // σ ≈ 0.70
    expect(html).toContain('2 maçta rating yok');
    expect(html).toContain('En iyi 9.0: Erzurumspor FK, 21 Ağu 2026');
    expect(html).toContain('İstikrar: Dalgalı.');
  });

  it('5 maçtan az reyting → istikrar etiketi yok, açıklama var; hiç yoksa boş durum', () => {
    state.trendRows = trendRows.slice(0, 3);
    let html = render();
    expect(html).not.toContain('data-testid="rating-consistency"');
    expect(html).toContain('İstikrar için en az 5 maç gerekir');
    state.trendRows = [trendRows[4]];
    html = render();
    expect(html).toContain('Son maçlarda rating verisi yok.');
    expect(html).toContain('1 maçta rating yok');
    state.trendRows = trendRows;
  });
});

