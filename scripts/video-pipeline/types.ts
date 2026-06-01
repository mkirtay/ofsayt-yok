export interface StarPlayer {
  name: string;
  value: string;
  age: number;
  club: string;
}

/**
 * Bir verinin nereden geldiğini açıkça belirtir.
 * - `live`: kaynaktan başarıyla scrape edildi
 * - `static`: scrape başarısız/geçersiz oldu, statik referans veri kullanıldı
 * - `failed`: ne canlı ne statik veri elde edilebildi (alanlar boş/null)
 */
export type DataSourceStatus = 'live' | 'static' | 'failed';

export interface WcHistoryEntry {
  year: number;
  finish: string;
}

export interface TransfermarktData {
  squadValue: string;
  avgAge: number;
  starPlayer: StarPlayer | null;
}

export interface FbrefData {
  goalsPerGame: number | null;
  xgPerGame: number | null;
  possessionPct: number | null;
  season: string;
}

export interface WorldFootballData {
  history: WcHistoryEntry[];
  titles: number;
  bestFinish: string;
  totalAppearances: number;
  firstAppearance: number | null;
}

export interface TeamBriefing {
  team: string;
  teamSlug: string;
  squadValue: string;
  avgAge: number;
  starPlayer: StarPlayer | null;
  wcHistory: WcHistoryEntry[];
  titles: number;
  bestFinish: string;
  totalAppearances: number;
  lastWcFinish: string;
  goalsPerGame: number | null;
  xgPerGame: number | null;
  possessionPct: number | null;
  interestingFacts: string[];
  sources: {
    transfermarkt: DataSourceStatus;
    fbref: DataSourceStatus;
    worldfootball: DataSourceStatus;
  };
}
