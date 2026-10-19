import { getSeasonsList, type CompetitionTableData, type SeasonListItem } from '@/services/liveScoreService';
import { fetchCompetitionStandings } from '@/services/competitionStandings';

/**
 * Puan durumu + sezon listesi + seçili sezon (maç sayfası ve takım sayfası yan paneli). Tablo isteği hata verirse
 * FIRLATIR (hata "puan durumu yok" sayılmaz; çağıran "yüklenemedi · tekrar dene" gösterir). Sezon listesi hatası yutulur.
 */
export async function loadStandingsForMatch(cid: number): Promise<{
  seasons: SeasonListItem[];
  selectedSeasonId: number | null;
  standings: CompetitionTableData | null;
}> {
  const compIdStr = String(cid);
  const [seasonsList, table1] = await Promise.all([
    getSeasonsList({ competitionId: compIdStr }),
    fetchCompetitionStandings(compIdStr),
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
    tableFinal = await fetchCompetitionStandings(compIdStr, { season: sid });
  }

  return {
    seasons: seasonsList,
    selectedSeasonId: sid,
    standings: tableFinal ?? table1,
  };
}
