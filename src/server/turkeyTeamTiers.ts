/**
 * Takım → Türkiye lig kademesi haritası (kupa maçlarındaki rozet için).
 *
 * Takım başına istek ATILMAZ: dört Türkiye liginin güncel puan tablosundan (Süper Lig, 1. Lig, 2. Lig Beyaz/Kırmızı)
 * tek seferde türetilir. Tablolar `getCompetitionTableFull` → paylaşımlı Sportmonks cache'inden geçer (takım sayfası ve
 * yan panelle AYNI cache anahtarları). Uç nokta CDN'de 24 saat tutulur.
 */
import {
  getCompetitionTableFull,
  getSeasonsList,
  type CompetitionTableData,
  type CompetitionTableStandingRow,
} from '@/services/liveScoreService';
import { TURKEY_TIER_LEAGUE_IDS, type TurkeyTeamTiersPayload } from '@/config/turkeyTiers';

export type TurkeyTiersLoaders = {
  getTable: (leagueId: number) => Promise<CompetitionTableData | null>;
  /** Güncel sezonun başlangıç tarihi (YYYY-MM-DD); bulunamazsa null. */
  getSeasonStart: (leagueId: number, seasonId: number | undefined) => Promise<string | null>;
};

const defaultLoaders: TurkeyTiersLoaders = {
  getTable: (leagueId) => getCompetitionTableFull(String(leagueId)),
  getSeasonStart: async (leagueId, seasonId) => {
    const seasons = await getSeasonsList({ competitionId: String(leagueId), skipCalendarYearDedupe: true });
    const s = seasons.find((x) => x.id === seasonId) ?? seasons[0];
    return s?.start?.slice(0, 10) ?? null;
  },
};

function rowTeamId(row: CompetitionTableStandingRow): number | null {
  const id = row.team?.id ?? row.team_id;
  return id != null && Number.isFinite(Number(id)) ? Number(id) : null;
}

export type TurkeyTiersResult = {
  payload: TurkeyTeamTiersPayload;
  /** Dört ligin tamamı okunabildi mi (eksikse CDN süresi kısa tutulur, boşsa hiç cache'lenmez). */
  complete: boolean;
};

export async function loadTurkeyTeamTiers(loaders: TurkeyTiersLoaders = defaultLoaders): Promise<TurkeyTiersResult> {
  const settled = await Promise.all(
    TURKEY_TIER_LEAGUE_IDS.map(async (leagueId) => {
      try {
        return { leagueId, table: await loaders.getTable(leagueId) };
      } catch {
        return { leagueId, table: null };
      }
    }),
  );

  const tiers: Record<string, number> = {};
  let complete = true;
  let validFrom: string | undefined;
  for (const { leagueId, table } of settled) {
    const rows = table?.table ?? [];
    if (rows.length === 0) {
      complete = false;
      continue;
    }
    for (const row of rows) {
      const id = rowTeamId(row);
      if (id != null) tiers[String(id)] = leagueId;
    }
    if (validFrom === undefined) {
      const start = await loaders.getSeasonStart(leagueId, table?.season?.id).catch(() => null);
      if (start) validFrom = `${start.slice(0, 4)}-07-01`;
    }
  }
  return { payload: { tiers, ...(validFrom ? { validFrom } : {}) }, complete };
}
