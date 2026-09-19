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

/**
 * Maç detayı veri yükleme — `/matches/[slug]` sayfası ve masaüstü split-view
 * paneli (MatchHubPage) TEK bir kaynaktan besleniyor.
 */

type FindResult = Awaited<ReturnType<typeof findMatchById>>;

const PREFETCH_TTL_MS = 60_000;
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
  lineups: unknown;
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
  const [lineups, setLineups] = useState<unknown>(null);
  const [stats, setStats] = useState<MatchStatsData | null>(null);
  const [standings, setStandings] = useState<CompetitionTableData | null>(null);
  const [matchLoading, setMatchLoading] = useState(!initialMatch && Boolean(requestedMatchId));
  const [eventsLoading, setEventsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [lineupsLoading, setLineupsLoading] = useState(false);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [seasons, setSeasons] = useState<SeasonListItem[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isArchivedMatch, setIsArchivedMatch] = useState(false);

  const onFoundRef = useRef(onMatchFound);
  useEffect(() => {
    onFoundRef.current = onMatchFound;
  }, [onMatchFound]);

  useEffect(() => {
    if (!requestedMatchId) return;

    let cancelled = false;

    void (async () => {
      setMatchLoading(true);
      setEventsLoading(true);
      setStatsLoading(true);
      setLineupsLoading(true);
      setStandingsLoading(true);
      setNotFound(false);
      setIsArchivedMatch(false);
      setMatch(null);
      setEvents([]);
      setLineups(null);
      setStats(null);
      setStandings(null);
      setSeasons([]);
      setSelectedSeasonId(null);
      setMatchId('');

      const found = await findMatchByIdCached(requestedMatchId);
      if (cancelled) return;

      if (!found.match) {
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

      const apiMatchId = String(found.match.id);
      setMatchId(apiMatchId);
      setMatch(found.match);
      setEvents(found.events);
      setMatchLoading(false);
      setEventsLoading(found.events.length === 0);
      onFoundRef.current?.(found.match);

      if (!found.events.length) {
        void getMatchWithEvents(apiMatchId).then((ev) => {
          if (cancelled) return;
          if (ev.match) setMatch(ev.match);
          setEvents(ev.events);
          setEventsLoading(false);
        });
      }

      const cid = toStandingsCompetitionId(found.match.competition?.id ?? found.match.competition_id);
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
