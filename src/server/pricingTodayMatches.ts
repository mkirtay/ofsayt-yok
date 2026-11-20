/**
 * `/pricing` hero'sundaki "Bugünün maçları" kartı: kullanıcı fiyat sayfasından doğrudan bir maçın AI analizine gider.
 *
 * YENİ Sportmonks istek türü yok — `/bugun` ile aynı seçim (`loadTodayLanding`: Avrupa'da Türk takımı, derbi, Süper Lig,
 * Şampiyonlar Ligi, büyük 5). Yalnız BAŞLAMAMIŞ maçlar: analiz yalnız maç başlamadan üretilebilir, bitenler zaten açık.
 * Bugün başlamamış öne çıkan maç kalmadıysa (akşam / boş gün) yarınınkiler.
 * "Hazır" rozeti: ön üretilmiş (`analysisPregen`) PRE analizi olan maçlar — tek DB sorgusu; okunamazsa rozetsiz.
 */
import type { TodayLandingMatch } from '@/server/todayLanding';
import { loadTodayLanding } from '@/server/todayLanding';
import { shiftIsoDate } from '@/utils/dateStrip';

export const PRICING_TODAY_MAX = 5;

export type PricingTodayMatch = TodayLandingMatch & { ready: boolean };

export type PricingTodayData = {
  /** Gösterilen gün (YYYY-MM-DD, TSİ). */
  date: string;
  day: 'today' | 'tomorrow';
  matches: PricingTodayMatch[];
};

async function readyMatchIds(ids: readonly number[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const { prisma } = await import('@/lib/prisma');
    const rows = await prisma.matchAnalysis.findMany({
      where: { matchId: { in: ids.map(String) }, matchStatus: 'PRE' },
      select: { matchId: true },
    });
    return new Set(rows.map((r) => r.matchId));
  } catch (error) {
    console.error('[pricing] hazır analiz listesi okunamadı — rozetsiz', error);
    return new Set();
  }
}

/** Hata: maç verisi hiç alınamadıysa `loadTodayLanding` fırlatır (çağıran ISR'de son sayfayı korur). */
export async function loadPricingTodayMatches(
  today: string,
  now: number = Date.now(),
): Promise<{ data: PricingTodayData; revalidate: number }> {
  let { data, revalidate } = await loadTodayLanding(today, now);
  let upcoming = data.matches.filter((m) => m.phase === 'PRE');
  if (upcoming.length === 0 && data.date === today) {
    ({ data, revalidate } = await loadTodayLanding(shiftIsoDate(today, 1), now));
    upcoming = data.matches.filter((m) => m.phase === 'PRE');
  }
  const picked = upcoming.slice(0, PRICING_TODAY_MAX);
  const ready = await readyMatchIds(picked.map((m) => m.id));
  return {
    data: {
      date: data.date,
      day: data.date === today ? 'today' : 'tomorrow',
      matches: picked.map((m) => ({ ...m, ready: ready.has(String(m.id)) })),
    },
    revalidate,
  };
}
