/**
 * Kupon havuzu maçlarının AI analizini SABAH üretir (2026-11-20 kararı: kuponlar gün içinde, gündüzden hazır olmalı).
 *
 * Genel ön üretim (`server/analysisPregen.ts`) maçtan yalnız 2 sa – 3 sa 15 dk önce çalışır; bu yüzden 17:30 kuponuna akşam
 * maçları giremiyordu ve havuzdaki Türk takımı olmayan UEFA maçları hiç analiz almıyordu. Bu modül, kombine aracı açıkken
 * (`COMBO_TOOL_ENABLED`) Türkiye saatiyle `COMBO_PREGEN_FROM` (09:00) sonrasında BUGÜNÜN havuz maçlarını (config/comboPool.ts,
 * en çok 10) aday yapar; üretim yine analysisPregen'in tek üretim yolu + kilidi + çalışma başına sınırıyla (15 dk'da bir 3 maç →
 * ~1 saatte havuz biter). Maç zaten analizliyse atlanır (yeniden üretim yok). Yeni Sportmonks isteği yok: gün listesi ve tablolar
 * paylaşımlı önbellekten.
 *
 * Bedel: havuz maçlarının analizi muhtemel 11 / son dakika sakat bilgisi gelmeden (sabah) yazılır — herkesin gördüğü analiz de bu.
 */
import type { Match } from '@/models/liveScore';
import { selectPool, type PoolContext } from '@/config/comboPool';
import { matchToPoolInput } from '@/server/combo/pool';
import { toAfId } from '@/services/apiFootball/ids';
import { matchKickoffMs } from '@/utils/matchActivity';

/** Türkiye saati (dakika): bu saatten önce kupon ön üretimi yok. */
export const COMBO_PREGEN_FROM = 9 * 60;
/** Başlamasına bundan az kalan maç atlanır (genel pencere zaten 2 sa öncesinden kapsar). */
export const COMBO_PREGEN_MIN_LEAD_MS = 30 * 60_000;

export type ComboPregenCandidate = { id: number; name: string; leagueId: number; kickoffMs: number; reason: 'combo-pool' };

/** Saf seçim: başlamamış, yeterince ileride, havuzdaki maçlar (önem sırasıyla değil, başlama saatine göre). */
export function selectComboPregenCandidates(
  matches: readonly Match[],
  ctx: PoolContext,
  opts: { now: number; national: boolean },
): ComboPregenCandidate[] {
  const upcoming = matches.filter((m) => {
    if (m.status !== 'NOT STARTED') return false;
    if (!opts.national && toAfId(m.id) != null) return false;
    const ko = matchKickoffMs(m);
    return ko != null && ko - opts.now >= COMBO_PREGEN_MIN_LEAD_MS;
  });
  const byId = new Map(upcoming.map((m) => [String(m.id), m] as const));
  return selectPool(
    upcoming.map((m) => matchToPoolInput(m)),
    ctx,
  )
    .map((p) => {
      const m = byId.get(p.matchId)!;
      return { id: Number(m.id), name: `${p.homeName} vs ${p.awayName}`, leagueId: p.leagueId, kickoffMs: p.kickoffMs ?? 0, reason: 'combo-pool' as const };
    })
    .sort((a, b) => a.kickoffMs - b.kickoffMs);
}

/** Bayrak kapalı / saat erken → []; aksi halde bugünün havuz adayları. Hata çağırana fırlar (o çalışmada kupon adayı yok). */
export async function loadComboPregenCandidates(now: number): Promise<ComboPregenCandidate[]> {
  const { comboToolEnabled } = await import('@/config/comboTool');
  if (!comboToolEnabled()) return [];
  const { istanbulMinutes } = await import('@/server/combo/dailyCoupons');
  if (istanbulMinutes(now) < COMBO_PREGEN_FROM) return [];
  const [{ loadHomeDay }, { loadPoolContext }, { todayIsoIstanbul }, { nationalAnalysisEnabled }] = await Promise.all([
    import('@/server/homeDay'),
    import('@/server/combo/pool'),
    import('@/utils/dateStrip'),
    import('@/config/nationalMatches'),
  ]);
  const day = await loadHomeDay(todayIsoIstanbul());
  const ctx = await loadPoolContext(day.fixtureMatches.map((m) => matchToPoolInput(m)));
  return selectComboPregenCandidates(day.fixtureMatches, ctx, { now, national: nationalAnalysisEnabled() });
}
