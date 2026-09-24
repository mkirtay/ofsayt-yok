import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import profileFixture from '@/services/sportmonks/__fixtures__/playerProfileOsimhen.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';

const profile = mapPlayerProfile((profileFixture as unknown as { data: RawPlayer }).data);

const state = vi.hoisted(() => ({ profile: null as unknown, trendRows: [] as unknown[] }));
const vsState = vi.hoisted(() => ({ query: {} as Record<string, string>, opponents: [] as unknown[], vs: null as unknown }));
vi.mock('next/router', () => ({ useRouter: () => ({ query: vsState.query, pathname: '/players/[id]', push: vi.fn() }) }));
vi.mock('@/hooks/usePlayerVs', () => ({
  usePlayerVsOpponents: () => ({ data: { playerId: 455805, opponents: vsState.opponents }, isLoading: false, isError: false }),
  usePlayerVs: () => ({ data: vsState.vs, isLoading: false, isError: false }),
  usePlayerRecentMatches: () => ({ data: { playerId: 455805, minMinutesForAverage: 15, rows: state.trendRows }, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/usePlayerProfile', () => ({
  usePlayerProfile: () => ({ data: state.profile, isLoading: false }),
}));

import PlayerProfile, { ageFromBirth, formatTransferAmount, transferTypeLabel, formatPlayerDate } from './index';

const render = () => renderToStaticMarkup(<PlayerProfile playerId="455805" />);

/** PlayerLineupRow; `score` ev-dep sırasıyla verilip oyuncunun takımı açısından gol sayısına çevrilir. */
const lr = (fixtureId: number, date: string, isHome: boolean, opponentName: string, score: string, rating?: number, extra: Record<string, unknown> = {}) => {
  const [h, a] = score.split('-').map(Number);
  return {
    fixtureId, date: `${date} 17:00:00`, leagueId: 600, teamId: 34, teamName: 'Galatasaray', teamLogo: 'https://cdn.example/gs.png', opponentId: 900 + fixtureId, opponentName,
    isHome, goalsFor: isHome ? h : a, goalsAgainst: isHome ? a : h, started: true, minutes: 90,
    ...(rating !== undefined ? { rating } : {}), ...extra,
  };
};
const trendRows = [
  lr(11, '2026-08-14', true, 'Çorum FK', '2-2', 7.89),
  lr(12, '2026-08-21', false, 'Erzurumspor FK', '0-4', 9.01, { opponentLogo: 'https://cdn.example/erz.png' }),
  lr(13, '2026-08-29', true, 'Göztepe', '3-2', 8.24),
  lr(14, '2026-09-04', false, 'İstanbul Başakşehir', '3-2', 6.9),
  lr(15, '2026-09-09', false, 'Sporting CP', '0-1'), // oynadı, reyting yok
  lr(16, '2026-09-13', true, 'Kocaelispor', '1-0', undefined, { started: false, minutes: undefined }), // kadroda, oynamadı → grafikte yok
  lr(17, '2026-09-19', false, 'Trabzonspor', '4-0', 6.0, { started: false, minutes: 6 }), // kısa giriş
  lr(10, '2026-05-09', true, 'Antalyaspor', '4-2', 7.51),
];

describe('<PlayerProfile /> — gerçek Osimhen verisi', () => {
  state.profile = profile;
  state.trendRows = trendRows;
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
    expect(html).toMatch(/>8\.0<\/span><span[^>]*>Rating</); // 8.02 → tek ondalığa yuvarlanır
    expect(html).toContain('6.9 – 9.0'); // en düşük – en yüksek
    expect(html).toMatch(/data-tone="excellent"[^>]*>8\.0</); // sezon ortalaması reyting skalasıyla boyalı
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

  it('maç geçmişi (grafikle aynı veri): en yeni önce ilk 5; oynamadığı maçta "Kadroda, oynamadı"; "Tümünü Göster"', () => {
    const history = html.slice(html.indexOf('id="pp-matches"'));
    const ids = [...history.matchAll(/data-testid="match-history-row"[\s\S]*?href="\/matches\/(\d+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['17', '16', '15', '14', '13']);
    expect(history).toContain('Kadroda, oynamadı'); // 16
    expect(history).toMatch(/data-tone="fair"[^>]*>6\.9</); // 14: maç reytingi rozeti
    expect(history).toContain('title="Galatasaray"'); // oyuncunun o maçtaki takımı (logo)
    expect(history).toContain('Tümünü Göster');
  });

  it('KAPSAM DIŞI bölümler hiç yok: xG/xGOT, piyasa değeri, kupa, radar, topluluk oyu, sosyal', () => {
    // "Rakibe karşı" kapsam notu "lig ve kupa maçları" der — kupa/trofe LİSTESİ değil, veri kapsamı; o cümle hariç tutulur
    const t = html.toLowerCase().replace(/2024\/25&#x27;ten itibaren[^<]*/, '');
    for (const bad of ['xg', 'piyasa', 'market', 'kupa', 'trofe', 'radar', 'haftanın oyuncu', 'en popüler', 'sosyal', 'ilişki']) {
      expect(t, bad).not.toContain(bad);
    }
  });

  it('takım linki /teams/{id}', () => {
    expect(html).toContain('href="/teams/34"');
  });

  it('maç geçmişi: 5 satır ya da azsa buton yok', () => {
    state.trendRows = trendRows.slice(0, 5);
    expect(render()).not.toContain('Tümünü Göster');
    state.trendRows = trendRows;
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
    expect(html).toContain('Son 7 maç'); // sahaya çıktığı 7 maç (yedekte kaldığı 16 sayılmaz)
    const points = [...html.matchAll(/<a href="\/matches\/(\d+)" aria-label="([^"]+)"[^>]*data-tone="(\w+)"/g)].map((m) => [m[1], m[3]]);
    expect(points).toEqual([['10', 'good'], ['11', 'good'], ['12', 'excellent'], ['13', 'excellent'], ['14', 'fair'], ['17', 'poor']]);
    const svg = html.slice(html.indexOf('data-testid="rating-trend-svg"'), html.indexOf('</svg>'));
    expect(svg).not.toContain('href="/matches/16"'); // yedekte kalınan maç grafikte yok (Maç Geçmişi'nde var)
    expect(html).toContain('aria-label="4 Eyl 2026, Dep İstanbul Başakşehir, skor 3-2, rating 6.9"');
  });

  it('özet: ortalama, en iyi/en kötü, istikrar (≥5 maç), reytingsiz maç sayısı, ekran okuyucu özeti', () => {
    const html = render();
    expect(html).toMatch(/data-tone="good"[^>]*>7\.9</); // (7.51+7.89+9.01+8.24+6.9)/5 = 7.91 → "7.9" yeşil
    expect(html).toContain('Ort. 7.9');
    expect(html).toMatch(/data-testid="rating-consistency"[^>]*>Dalgalı/); // σ ≈ 0.70
    expect(html).toContain('1 maçta oynadı ama rating yok'); // yalnızca 15; yedekte kalınan 16 sayılmaz
    // kısa giriş (6') noktada soluk, ortalamaya/istikrara girmiyor
    expect(html).toContain('1 kısa giriş (15 dakikanın altı) soluk gösterilir');
    expect(html).toMatch(/aria-label="19 Eyl 2026, Dep Trabzonspor, skor 4-0, rating 6.0 — 15 dakikanın altında — ortalamaya katılmaz"/);
    expect(html).toMatch(/data-short="true"/);
    expect(html).toContain('En iyi 9.0: Erzurumspor FK, 21 Ağu 2026');
    expect(html).toContain('İstikrar: Dalgalı.');
  });

  it('5 maçtan az reyting → istikrar etiketi yok, açıklama var; hiç yoksa boş durum', () => {
    state.trendRows = trendRows.slice(0, 3);
    let html = render();
    expect(html).not.toContain('kısa giriş');
    expect(html).not.toContain('data-testid="rating-consistency"');
    expect(html).toContain('İstikrar için en az 5 maç gerekir');
    state.trendRows = [trendRows[4], trendRows[5]];
    html = render();
    expect(html).toContain('Son maçlarda rating verisi yok.');
    expect(html).toContain('1 maçta oynadı ama rating yok');
    state.trendRows = trendRows;
  });
});

