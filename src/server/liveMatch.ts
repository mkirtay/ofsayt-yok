/**
 * Maç detayının canlı güncellemesi (`GET /api/matches/[id]/live`).
 *
 * Kaynak: TÜM canlı maçları tek seferde getiren `livescores/inplay` (skor + durum + dakika + olaylar + istatistik).
 * Maç başına ayrı fixture çağrısı canlı maç sayısıyla çarpılırdı (20 maç × 3 anahtar × 20 sn ≈ 10.800/sa; Fixture
 * limiti 2.500/sa); inplay paylaşımlı cache'te 20 sn → izleyici ve maç sayısından bağımsız ~180 istek/sa (25 maçlık
 * sayfa başına). Değişmeyen alanlar (lig, stadyum, hakem) istenmez: istemci yalnız skor/durum/olay/istatistik günceller.
 *
 * Maç inplay'de yoksa (henüz başlamadı / bitti / Sportmonks ara durumları listeden düşürdüyse) tekil fixture'a
 * düşülür — maç sayfasının kullandığı AYNI cache anahtarları (`fixtures/{id}` + events, `statistics`), canlıyken
 * 20 sn. Böylece devre arası / uzatma arası / penaltılar inplay'de görünmese bile güncelleme durmaz; bittiğinde son
 * durum dönülür ve istemci durur.
 */
import type { Match } from '@/models/liveScore';
import type { MatchEvent, MatchStatsData } from '@/models/domain';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import { mapSportmonksEvents, mapSportmonksStatistics } from '@/services/sportmonksKatman2Mapper';
import { getMatchStats, getMatchWithEvents } from '@/services/liveScoreService';
import { isMatchLive } from '@/utils/matchActivity';

const LIVE_INCLUDE = 'participants;scores;state;periods;events;statistics';
/** Sayfa = cache anahtarı: 25 maçlık sayfa Redis boyut sınırının (900 KB) altında kalır (maç başına ~15–25 KB). */
const LIVE_PER_PAGE = 25;
const LIVE_MAX_PAGES = 4;

/** İstemcinin canlı maçta güncellediği alanlar (lig/stadyum/hakem vb. sayfa yüklenirken gelmişti). */
export type LiveMatchPatch = Pick<Match, 'id' | 'status' | 'state_code' | 'time' | 'scores'>;

export type LiveMatchPayload = {
  /** Maç hâlâ canlı mı (devre arası / uzatma arası dahil). `false` → istemci son durumu yazıp durur. */
  live: boolean;
  source: 'inplay' | 'fixture';
  match: LiveMatchPatch;
  events: MatchEvent[];
  stats: MatchStatsData | null;
};

export type LiveMatchDeps = {
  loadInplay: () => Promise<SportmonksFixture[]>;
  loadFixture: (id: string) => Promise<{ match: Match | null; events: MatchEvent[] }>;
  loadStats: (id: string) => Promise<MatchStatsData | null>;
  /** Canlı görünüp inplay'de olmayan maç (Sportmonks ara durumları) — gözlem için. */
  onLiveMissingFromInplay?: (id: string, status: string) => void;
};

async function loadInplay(): Promise<SportmonksFixture[]> {
  return sportmonksCollectAllPages<SportmonksFixture>({
    basePath: 'football',
    path: '/livescores/inplay',
    perPage: LIVE_PER_PAGE,
    maxPages: LIVE_MAX_PAGES,
    extraParams: { include: LIVE_INCLUDE },
  });
}

const reportedMissing = new Set<string>();

const defaultDeps: LiveMatchDeps = {
  loadInplay,
  loadFixture: getMatchWithEvents,
  loadStats: getMatchStats,
  onLiveMissingFromInplay: (id, status) => {
    // Instance başına maç başına bir kez: Sportmonks'un hangi ara durumda maçı inplay'den düşürdüğünü görmek için.
    if (reportedMissing.has(id)) return;
    reportedMissing.add(id);
    console.warn(`[live] maç ${id} canlı (${status}) ama livescores/inplay'de yok — tekil fixture'a düşüldü`);
  },
};

function toPatch(m: Match): LiveMatchPatch {
  return {
    id: m.id,
    status: m.status,
    ...(m.state_code ? { state_code: m.state_code } : {}),
    time: m.time,
    ...(m.scores ? { scores: m.scores } : {}),
  };
}

/** `null` → maç ne inplay'de ne de tekil fixture'da (yok / sağlayıcı hatası). */
export async function loadLiveMatch(matchId: string, deps: LiveMatchDeps = defaultDeps): Promise<LiveMatchPayload | null> {
  const id = Number(matchId);
  const rows = await deps.loadInplay();
  const row = rows.find((r) => Number(r.id) === id);
  if (row) {
    const match = mapSportmonksFixtureToMatch(row);
    return {
      live: isMatchLive(match),
      source: 'inplay',
      match: toPatch(match),
      events: mapSportmonksEvents(row),
      stats: mapSportmonksStatistics(row.statistics),
    };
  }

  const [{ match, events }, stats] = await Promise.all([deps.loadFixture(matchId), deps.loadStats(matchId)]);
  if (!match) return null;
  const live = isMatchLive(match);
  if (live) deps.onLiveMissingFromInplay?.(matchId, match.status);
  return { live, source: 'fixture', match: toPatch(match), events, stats };
}
