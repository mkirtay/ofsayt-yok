import type { MatchLineupData } from '@/models/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  findMatchById,
  getCompetitionTableFull,
  getMatchLineups,
  getMatchStats,
  getMatchWithEvents,
  getSeasonsList,
  type CompetitionTableData,
  type SeasonListItem,
} from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { MatchEvent, MatchStatsData } from '@/models/domain';
import { toStandingsCompetitionId } from '@/services/sportmonksProviderFlag';
import { fetchWorldCupStandingsBundle, isWorldCupCompetition } from '@/utils/worldCupStandings';
import { useLiveMatchUpdates } from '@/hooks/useLiveMatchUpdates';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { matchKickoffMs } from '@/utils/matchActivity';
import { isProbableLineup } from '@/utils/lineupStatus';
import type { LiveMatchPayload } from '@/server/liveMatch';

/**
 * Maç detayı veri yükleme — `/matches/[slug]` sayfası ve masaüstü split-view
 * paneli (MatchHubPage) TEK bir kaynaktan besleniyor.
 */

type FindResult = Awaited<ReturnType<typeof findMatchById>>;

const PREFETCH_TTL_MS = 60_000;
/** Tahmini kadro yenileme: maçtan önceki bu pencerede, bu aralıkla. */
const LINEUP_REFRESH_WINDOW_MS = 2 * 60 * 60_000;
const LINEUP_REFRESH_MS = 5 * 60_000;
const findCache = new Map<string, { at: number; promise: Promise<FindResult> }>();

/** Aynı maç için kısa süreli tekilleştirilmiş `findMatchById` — hover prefetch ile panel açılışı paylaşır. */
export function findMatchByIdCached(matchId: string): Promise<FindResult> {
  const hit = findCache.get(matchId);
  if (hit && Date.now() - hit.at < PREFETCH_TTL_MS) return hit.promise;
  const promise = findMatchById(matchId);
  findCache.set(matchId, { at: Date.now(), promise });
  // Başarısız/boş sonuçlar cache'te kalmasın
  promise
    .then((r) => {
      if (!r.match) findCache.delete(matchId);
    })
    .catch(() => findCache.delete(matchId));
  return promise;
}

/** Maça hover/focus/tıklamada çağrılır: panel açıldığında ana veri zaten yolda/hazır olur. */
export function prefetchMatchDetail(matchId: string): void {
  if (!/^\d+$/.test(matchId)) return;
  void findMatchByIdCached(matchId).catch(() => {});
}

export async function loadStandingsForMatch(cid: number): Promise<{
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
}> {
  if (isWorldCupCompetition(cid)) {
    const wc = await fetchWorldCupStandingsBundle();
    return {
      seasons: wc.seasons,
      selectedSeasonId: wc.selectedSeasonId,
      standings: wc.standings,
    };
  }

  const compIdStr = String(cid);
  const [seasonsList, table1] = await Promise.all([
    getSeasonsList({ competitionId: compIdStr }),
    getCompetitionTableFull(compIdStr),
  ]);

  const fromTable =
    table1?.season?.id != null && Number.isFinite(Number(table1.season.id))
      ? Number(table1.season.id)
      : null;
  let sid: number | null = fromTable;
  if (sid != null && seasonsList.length && !seasonsList.some((s) => s.id === sid)) {
    sid = seasonsList[0]!.id;
  } else if (sid == null && seasonsList.length) {
    sid = seasonsList[0]!.id;
  }

  const needTableRefetch =
    sid != null &&
    table1 != null &&
    (table1.season?.id == null || Number(table1.season.id) !== sid);

  let tableFinal = table1;
  if (needTableRefetch && sid != null) {
    tableFinal = await getCompetitionTableFull(compIdStr, { season: sid });
  }

  return {
    seasons: seasonsList,
    selectedSeasonId: sid,
    standings: tableFinal ?? table1,
  };
}

export type MatchDetailState = {
  matchId: string;
  match: Match | null;
  events: MatchEvent[];
  lineups: MatchLineupData | null;
  stats: MatchStatsData | null;
  standings: CompetitionTableData | null;
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  matchLoading: boolean;
  eventsLoading: boolean;
  statsLoading: boolean;
  lineupsLoading: boolean;
  standingsLoading: boolean;
  notFound: boolean;
  isArchivedMatch: boolean;
  handleSeasonChange: (seasonId: number, competitionIdStr: string) => Promise<void>;
};

export type UseMatchDetailOptions = {
  /** SSR'da çözülmüş maç — SEO/OG etiketleri ilk render'da dolu kalsın diye başlangıç state'i */
  initialMatch?: Match | null;
  /** Maç çözüldüğünde (ör. canonical URL düzeltmesi için) çağrılır */
  onMatchFound?: (match: Match) => void;
};

/**
 * @param requestedMatchId boş string → hiçbir şey yüklenmez (panel kapalı / router hazır değil)
 */
export function useMatchDetail(
  requestedMatchId: string,
  { initialMatch = null, onMatchFound }: UseMatchDetailOptions = {},
): MatchDetailState {
  const [matchId, setMatchId] = useState('');
  const [match, setMatch] = useState<Match | null>(initialMatch);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [lineups, setLineups] = useState<MatchLineupData | null>(null);
  const [stats, setStats] = useState<MatchStatsData | null>(null);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [matchLoading, setMatchLoading] = useState(!initialMatch && Boolean(requestedMatchId));
  // Olay/istatistik/kadro/puan durumu yalnız istemcide çekilir: maç istendiyse baştan "yükleniyor". Yoksa SSR HTML'i
  // (ve istemci istekleri başlayana kadar ekran) her maç için "kadrolar açıklanmadı / veri yok" yazıyordu.
  const [eventsLoading, setEventsLoading] = useState(Boolean(requestedMatchId));
  const [statsLoading, setStatsLoading] = useState(Boolean(requestedMatchId));
  const [lineupsLoading, setLineupsLoading] = useState(Boolean(requestedMatchId));
  const [standingsLoading, setStandingsLoading] = useState(Boolean(requestedMatchId));
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isArchivedMatch, setIsArchivedMatch] = useState(false);

  const onFoundRef = useRef(onMatchFound);
  useEffect(() => {
    onFoundRef.current = onMatchFound;
  }, [onMatchFound]);
  // SSR'ın çözdüğü maç (yalnız sayfa; panelde yok). Aynı maç istendiyse yükleme effect'i onu SİLMEZ: kart
  // hydration sonrası iskelete dönmesin (CLS/LCP), istemci araması arka planda tazeler.
  const initialMatchRef = useRef(initialMatch);
  useEffect(() => {
    initialMatchRef.current = initialMatch;
  }, [initialMatch]);

  useEffect(() => {
    if (!requestedMatchId) return;

    let cancelled = false;

    const seeded =
      initialMatchRef.current && String(initialMatchRef.current.id) === requestedMatchId ? initialMatchRef.current : null;

    void (async () => {
      setMatchLoading(!seeded);
      setEventsLoading(true);
      setStatsLoading(true);
      setLineupsLoading(true);
      setStandingsLoading(true);
      setNotFound(false);
      setIsArchivedMatch(false);
      setMatch(seeded);
      setEvents([]);
      setLineups(null);
      setStats(null);
      setStandings(null);
      setSeasons([]);
      setSelectedSeasonId(null);
      setMatchId('');

      const found = await findMatchByIdCached(requestedMatchId);
      if (cancelled) return;
      // İstemci araması boş döndüyse (geçici sağlayıcı hatası) SSR'ın çözdüğü maçla devam: sayfa 404'e düşmesin.
      const resolved = found.match ?? seeded;

      if (!resolved) {
        // Canlı sağlayıcıda bulunamadı — arşivlenmiş (saklı analiz/trivia'sı olan
        // eski/kaldırılmış) bir maç mı diye kontrol et, doğrudan 404'e düşme.
        try {
          const archRes = await fetch(`/api/matches/${requestedMatchId}/archived-status`);
          if (cancelled) return;
          if (archRes.ok) {
            const archBody = (await archRes.json()) as { isArchived?: boolean };
            if (archBody.isArchived) {
              setIsArchivedMatch(true);
              setMatchLoading(false);
              return;
            }
          }
        } catch {
          // Ağ hatası — güvenli taraf: normal "bulunamadı" akışına düş
        }
        if (cancelled) return;
        setNotFound(true);
        setMatchLoading(false);
        return;
      }

      const apiMatchId = String(resolved.id);
      // SSR maçıyla devam ediliyorsa olaylar ayrıca çekilir (fikstürden bulunmuş gibi).
      const fromFixture = found.match ? found.fromFixture : true;
      setMatchId(apiMatchId);
      setMatch(resolved);
      setEvents(found.match ? found.events : []);
      setMatchLoading(false);
      // Olaylar yalnızca maç fikstür listesinden bulunduysa eksik (eski sağlayıcı); events/fixture
      // isteğinden geldiyse boş liste gerçektir (başlamamış maç) — aynı isteği tekrar atma.
      setEventsLoading(fromFixture);
      onFoundRef.current?.(resolved);

      if (fromFixture) {
        void getMatchWithEvents(apiMatchId).then((ev) => {
          if (cancelled) return;
          if (ev.match) setMatch(ev.match);
          setEvents(ev.events);
          setEventsLoading(false);
        });
      }

      const cid = toStandingsCompetitionId(resolved.competition?.id ?? resolved.competition_id);
      if (cid == null) {
        setStandingsLoading(false);
      }

      void getMatchStats(apiMatchId).then((statsData) => {
        if (cancelled) return;
        setStats(statsData);
        setStatsLoading(false);
      });

      void getMatchLineups(apiMatchId).then((lineupsData) => {
        if (cancelled) return;
        setLineups(lineupsData);
        setLineupsLoading(false);
      });

      if (cid != null) {
        void loadStandingsForMatch(cid).then((standingsBundle) => {
          if (cancelled) return;
          setSeasons(standingsBundle.seasons);
          setSelectedSeasonId(standingsBundle.selectedSeasonId);
          setStandings(standingsBundle.standings);
          setStandingsLoading(false);
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requestedMatchId]);

  // Canlı güncelleme: yalnız skor/durum/dakika + olaylar + istatistik (lig/stadyum/hakem sayfa verisinde kalır).
  const applyLiveUpdate = useCallback((payload: LiveMatchPayload) => {
    setMatch((prev) =>
      prev && String(prev.id) === String(payload.match.id)
        ? {
            ...prev,
            status: payload.match.status,
            // Özel durum (ertelendi, durduruldu…) kalkınca alan da kalkmalı → yoksa undefined yazılır.
            state_code: payload.match.state_code,
            time: payload.match.time,
            ...(payload.match.scores ? { scores: payload.match.scores } : {}),
          }
        : prev,
    );
    setEvents(payload.events);
    if (payload.stats) setStats(payload.stats);
  }, []);
  useLiveMatchUpdates(matchId, match, applyLiveUpdate);

  // Tahmini kadro ("Muhtemel 11") sayfa açıkken resmîleşebilir: maçtan önceki 2 saatte 5 dk'da bir, maç başlayınca
  // (evre PRE'den çıkınca) bir kez yeniden çekilir. Resmî kadro gelince durur. Sunucu önbelleği bu istekleri zaten
  // 30 sn–10 dk tutuyor (cachePolicy).
  const phase = deriveMatchPhase(match?.status);
  const kickoffMs = match ? matchKickoffMs(match) : null;
  const lineupProbable = lineups != null && isProbableLineup(lineups, phase);
  useEffect(() => {
    if (!matchId || !lineupProbable) return;
    let cancelled = false;
    const refresh = () => {
      void getMatchLineups(matchId).then((data) => {
        if (!cancelled && data) setLineups(data);
      });
    };
    if (phase !== 'PRE') {
      refresh();
      return () => {
        cancelled = true;
      };
    }
    if (kickoffMs == null) return;
    let intervalId: number | undefined;
    const startPolling = () => {
      refresh();
      intervalId = window.setInterval(refresh, LINEUP_REFRESH_MS);
    };
    const untilWindow = kickoffMs - LINEUP_REFRESH_WINDOW_MS - Date.now();
    let timeoutId: number | undefined;
    if (untilWindow <= 0) startPolling();
    else if (untilWindow < 24 * 60 * 60_000) timeoutId = window.setTimeout(startPolling, untilWindow);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [matchId, lineupProbable, phase, kickoffMs]);

  const handleSeasonChange = useCallback(async (seasonId: number, competitionIdStr: string) => {
    setSelectedSeasonId(seasonId);
    setStandingsLoading(true);
    const table = await getCompetitionTableFull(competitionIdStr, { season: seasonId });
    setStandings(table);
    setStandingsLoading(false);
  }, []);

  return {
    matchId,
    match,
    events,
    lineups,
    stats,
    standings,
    seasons,
    selectedSeasonId,
    matchLoading,
    eventsLoading,
    statsLoading,
    lineupsLoading,
    standingsLoading,
    notFound,
    isArchivedMatch,
    handleSeasonChange,
  };
}
