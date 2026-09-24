/**
 * İngilizce çıktı doğrulaması: `lib/i18n` İngilizce sözlükle taklit edilir (gerçek `I18nProvider`
 * dili `localStorage`'tan okuyor, sunucu render'ında çalışmıyor). Amaç sözlüğün doğruluğu DEĞİL
 * (onu `utils/localeCatalog.test.ts` doğruluyor) — bileşenlerin metni gerçekten `t`'den ALDIĞINI,
 * yani sabit Türkçe metin kalmadığını kanıtlamak.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import profileFixture from '@/services/sportmonks/__fixtures__/playerProfileOsimhen.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';
import enPlayer from '../../../public/locales/en/player.json';
import enCompare from '../../../public/locales/en/compare.json';

const DICTS: Record<string, Record<string, unknown>> = {
  player: enPlayer as Record<string, unknown>,
  compare: enCompare as Record<string, unknown>,
};

function resolve(dict: Record<string, unknown>, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => {} }),
  useTranslation: (ns: string) => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let value = resolve(DICTS[ns] ?? {}, key) ?? key;
      if (opts) value = value.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k] ?? ''));
      return value;
    },
  }),
}));

const state = vi.hoisted(() => ({ rows: [] as unknown[], hasMore: false }));
vi.mock('@/hooks/usePlayerProfile', async () => {
  const { buildRatingSeries, summarizeRatings } = await import('@/utils/ratingTrend');
  return {
    usePlayerProfile: () => ({ data: mapPlayerProfileLazy(), isLoading: false }),
    usePlayerMatchHistory: () => ({ rows: state.rows, loading: false, hasMore: state.hasMore, expand: () => {}, empty: false }),
    usePlayerRatingTrend: () => {
      const series = buildRatingSeries(state.rows as never);
      return { series, summary: summarizeRatings(series.points), loading: false, error: false };
    },
  };
});

let cached: ReturnType<typeof mapPlayerProfile> | null = null;
function mapPlayerProfileLazy() {
  cached ??= mapPlayerProfile((profileFixture as unknown as { data: RawPlayer }).data);
  return cached;
}

import PlayerProfile from './index';

describe('<PlayerProfile /> — İngilizce', () => {
  state.rows = [
    { matchId: 1, date: '2026-09-04', isHome: false, opponent: 'İstanbul Başakşehir', score: '1-3', inSquad: true, started: false, minutes: 33, rating: 6.9, goals: 1 },
    { matchId: 2, date: '2026-09-13', isHome: true, opponent: 'Kocaelispor', score: '1-0', inSquad: false },
  ];
  state.hasMore = true;
  const html = renderToStaticMarkup(<PlayerProfile playerId="455805" />);

  it('bölüm başlıkları İngilizce', () => {
    for (const s of ['Profile', 'Season Statistics', 'Detailed Statistics', 'Transfers', 'Match History']) {
      expect(html, s).toContain(s);
    }
  });

  it('biyografi etiketleri, ayak ve yaş İngilizce', () => {
    for (const s of ['Date of birth', 'City of birth', 'Preferred foot', 'Right', '27 yrs']) {
      expect(html, s).toContain(s);
    }
  });

  it('istatistik grubu ve satır etiketleri İngilizce (veri tablosu da çevriliyor)', () => {
    for (const s of ['Shooting &amp; Attack', 'Total shots', 'Defending &amp; Duels', 'Aerial duels won']) {
      expect(html, s).toContain(s);
    }
  });

  it('transfer tipi ve bedel birimi İngilizce', () => {
    expect(html).toContain('End of loan');
    expect(html).toContain('75 M');
    expect(html).not.toContain('75 Mn');
  });

  it('rating grafiği İngilizce (tekil/çoğul dahil)', () => {
    for (const s of ['Rating Trend', 'Last 1 match', 'No rating in 1 match', 'Average', 'Best', 'Worst', 'At least 5 matches are needed for consistency', 'Avg 6.9']) {
      expect(html, s).toContain(s);
    }
    expect(html).toContain('aria-label="4 Sept 2026, A İstanbul Başakşehir, score 1-3, rating 6.9"');
  });

  it('maç geçmişi etiketleri İngilizce', () => {
    for (const s of ['Not in squad', 'Show all', 'min', 'Came off the bench']) expect(html, s).toContain(s);
  });

  it('hiçbir Türkçe kalıntı yok', () => {
    for (const bad of ['Profil<', 'Sezon', 'Detaylı', 'Transferler', 'Maç Geçmişi', 'Kadroda yok', 'Tümünü Göster', 'Kiralık', 'Toplam şut', 'Doğum', 'yaş<']) {
      expect(html, bad).not.toContain(bad);
    }
  });
});
