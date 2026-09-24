import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import profileFixture from '@/services/sportmonks/__fixtures__/playerProfileOsimhen.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';

const profile = mapPlayerProfile((profileFixture as unknown as { data: RawPlayer }).data);

const state = vi.hoisted(() => ({ profile: null as unknown, rows: [] as unknown[], hasMore: false, loading: false }));
vi.mock('@/hooks/usePlayerProfile', () => ({
  usePlayerProfile: () => ({ data: state.profile, isLoading: false }),
  usePlayerMatchHistory: () => ({ rows: state.rows, loading: state.loading, hasMore: state.hasMore, expand: () => {}, empty: false }),
}));

import PlayerProfile, { ageFromBirth, formatTransferAmount, transferTypeLabel, formatPlayerDate } from './index';

const render = () => renderToStaticMarkup(<PlayerProfile playerId="455805" />);

describe('<PlayerProfile /> — gerçek Osimhen verisi', () => {
  state.profile = profile;
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
