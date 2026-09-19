/**
 * Sportmonks v3 Football API'sinin ham response şekilleri.
 *
 * Bu tipler docs/SPORTMONKS_MIGRATION.md'deki Pass 1-5 boyunca gerçek isteklerle
 * doğrulanan alanları yansıtır. Sadece rapor kapsamındaki (Katman-1 + Pass 4/5'te
 * test edilen) alanlar tanımlı — Sportmonks response'ları bundan çok daha zengin
 * olabilir, buradaki tipler "gördüğümüz kadarı" ile sınırlı.
 */

/** Pass 4/5'te doğrulanan bağımsız kota havuzları (en az 6 tane). */
export type SportmonksEntityPool =
  | 'Fixture'
  | 'League'
  | 'Standing'
  | 'Topscorer'
  | 'PlayerTeam'
  | 'Type'
  /** Rapor kapsamında görülmemiş ama Sportmonks yeni bir havuz eklerse diye açık bırakıldı. */
  | (string & {});

export type SportmonksRateLimit = {
  resets_in_seconds: number;
  remaining: number;
  requested_entity: SportmonksEntityPool;
};

/** Pass 1 Genel Bulgu 1: total_pages/total YOK, sadece has_more + next_page/next_cursor. */
export type SportmonksPagination = {
  count: number;
  per_page: number;
  has_more: boolean;
  current_page: number;
  next_page?: string;
  next_cursor?: string;
};

export type SportmonksEnvelope<T> = {
  data: T;
  pagination?: SportmonksPagination;
  rate_limit?: SportmonksRateLimit;
  message?: string;
  errors?: Record<string, string[]>;
};

/** `state.short_name` benzersiz DEĞİL — id 9 ve id 26 ikisi de "PEN" (Pass 5 keşfi). */
export type SportmonksState = {
  id: number;
  state: string;
  name: string;
  short_name: string;
  developer_name?: string;
};

export type SportmonksParticipant = {
  id: number;
  name: string;
  image_path?: string | null;
  meta?: {
    location: 'home' | 'away';
    winner: boolean | null;
    position?: number | null;
  };
};

export type SportmonksScoreRow = {
  type_id: number;
  participant_id: number;
  description: string;
  score: { goals: number; participant: 'home' | 'away' };
};

export type SportmonksPeriod = {
  id: number;
  type_id: number;
  description: string;
  started: number | null;
  ended: number | null;
  ticking: boolean;
  sort_order: number;
  period_length: number;
  minutes: number;
  seconds: number;
  has_timer: boolean;
};

export type SportmonksVenue = {
  id: number;
  country_id?: number;
  city_id?: number;
  name: string | null;
  address?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  capacity?: number | null;
  image_path?: string | null;
  city_name: string | null;
  surface?: string | null;
};

export type SportmonksRefereePerson = {
  id: number;
  name?: string;
  display_name?: string;
};

export type SportmonksRefereeRow = {
  referee_id: number;
  type_id: number;
  referee?: SportmonksRefereePerson;
};

export type SportmonksRound = {
  id: number;
  league_id: number;
  season_id: number;
  name: string;
  finished?: boolean;
  is_current?: boolean;
  starting_at?: string;
  ending_at?: string;
};

export type SportmonksStage = {
  id?: number;
  league_id?: number;
  season_id?: number;
  name: string;
};

export type SportmonksFixtureRoundStage = {
  round?: SportmonksRound | null;
  stage?: SportmonksStage | null;
};

export type SportmonksEventRow = {
  id: number;
  fixture_id: number;
  participant_id: number;
  type_id: number;
  player_id?: number;
  player_name?: string;
  related_player_id?: number;
  related_player_name?: string;
  result?: string;
  info?: string | null;
  addition?: string | null;
  minute: number;
  extra_minute?: number | null;
  sub_type_id?: number;
  sort_order?: number;
};

export type SportmonksStatisticRow = {
  id: number;
  fixture_id: number;
  type_id: number;
  participant_id: number;
  location: 'home' | 'away';
  data: { value: number | string };
};

/** `include=lineups.player` (Faz 3 doğrulaması, 2026-09-18) — oyuncu fotoğrafı burada. */
export type SportmonksLineupPlayer = {
  id: number;
  display_name?: string;
  name?: string;
  image_path?: string | null;
  /** Ayrıntılı mevki (24 GK, 148 CB, 154 RB …) — mevcut `lineups.player` include'unda HER oyuncuda gelir. */
  detailed_position_id?: number | null;
  /** `include=lineups.player.nationality` — bayrak PNG'si (`image_path`); ~%95 oyuncuda dolu. */
  nationality?: { name?: string; iso2?: string; image_path?: string | null } | null;
};

/** `include=lineups.details` — oyuncu bazlı maç istatistikleri (~50 tip); yalnızca `RATING` (118) kullanılıyor. */
export type SportmonksLineupDetail = {
  type_id: number;
  data: { value: number | string };
};

export type SportmonksLineupRow = {
  id: number;
  fixture_id: number;
  player_id: number;
  team_id: number;
  position_id: number;
  type_id: number;
  formation_field?: string | null;
  formation_position?: number | null;
  player_name: string;
  jersey_number?: number;
  player?: SportmonksLineupPlayer;
  details?: SportmonksLineupDetail[];
};

/** `/core/types` satırı — Pass 5. */
export type SportmonksTypeEntry = {
  id: number;
  name: string;
  code?: string;
  developer_name?: string;
  model_type?: string;
  stat_group?: string | null;
};

/** Pass 1 `getAllLiveMatches`/`getFixturesByDate` bölümü — `include=league.country`. */
export type SportmonksCountry = {
  id: number;
  name: string;
  fifa_name?: string | null;
  iso2?: string | null;
  image_path?: string | null;
};

/**
 * Pass 1 bölümü — `type`/`sub_type` her zaman "league"/"domestic_cup" gibi genel bir
 * sözlükten geliyor, `is_league`/`is_cup` gibi hazır boolean alan YOK (fixture
 * `inplayFixture.json`'da Türkiye Kupası bile `type:"league"` döndürdü — asıl ayrım
 * `sub_type` alanında, bkz. sportmonksFixtureMapper.ts).
 */
export type SportmonksLeague = {
  id: number;
  name: string;
  image_path?: string | null;
  type?: string;
  sub_type?: string;
  country?: SportmonksCountry | null;
};

/** Pass 3 "Soru 2" — `include=group`, sadece eski/klasik grup formatlı sezonlarda dolu. */
export type SportmonksGroup = {
  id?: number;
  league_id?: number;
  season_id?: number;
  stage_id?: number;
  name: string;
};

/**
 * `/livescores/inplay`, `/fixtures/date/{date}`, `/fixtures/between/{from}/{to}`
 * satırlarının ortak şekli — Pass 1-3'te doğrulanan tüm include'ların birleşimi.
 * Her include isteğe bağlı olduğu için (çağıran taraf neyi istediyse o dolar) tüm
 * alanlar opsiyonel.
 */
export type SportmonksFixture = {
  id: number;
  league_id?: number;
  season_id?: number;
  state_id?: number;
  name?: string;
  starting_at?: string | null;
  participants?: SportmonksParticipant[];
  scores?: SportmonksScoreRow[];
  state?: SportmonksState;
  periods?: SportmonksPeriod[];
  league?: SportmonksLeague | null;
  venue?: SportmonksVenue | null;
  referees?: SportmonksRefereeRow[];
  round?: SportmonksRound | null;
  stage?: SportmonksStage | null;
  group?: SportmonksGroup | null;
  /** Faz 3 — `include=events` (getMatchWithEvents). */
  events?: SportmonksEventRow[];
  /** Faz 3 — `include=statistics` (getMatchStats). */
  statistics?: SportmonksStatisticRow[];
  /** Faz 3 — `include=lineups.player` (getMatchLineups). */
  lineups?: SportmonksLineupRow[];
};

// ─── Faz 3 — Katman-2/3 (maç detay, H2H, sıralama, kadro) ──────────────────

/**
 * `standings/seasons/{id}` `details[].type` satırı — Faz 3 kapsamında
 * 2026-09-18'de gerçek istekle doğrulandı (`GET /standings/seasons/27965?
 * include=participant;details.type`, La Liga). `developer_name` alanı
 * dokümanda hiç bahsedilmiyordu ama gerçek response'ta mevcut ve `name`'deki
 * yazım hatasından (`"Overal Goals Scored"`) bağımsız, makine-okur bir anahtar
 * — bkz. `standingsPivot.ts`.
 */
export type SportmonksStandingDetailType = {
  id: number;
  name: string;
  developer_name?: string;
  stat_group?: string | null;
};

export type SportmonksStandingDetail = {
  id: number;
  type_id: number;
  value: number;
  type?: SportmonksStandingDetailType;
};

export type SportmonksStandingParticipant = {
  id: number;
  name: string;
  short_code?: string;
  image_path?: string | null;
};

export type SportmonksStandingRow = {
  id: number;
  participant_id: number;
  league_id: number;
  season_id: number;
  position: number;
  points: number;
  group_id?: number | null;
  stage_id?: number | null;
  participant?: SportmonksStandingParticipant;
  details?: SportmonksStandingDetail[];
};

/** `topscorers/seasons/{id}`, `squads/teams/{id}` gibi endpoint'lerde ortak oyuncu şekli. */
export type SportmonksPlayer = {
  id: number;
  display_name?: string;
  name?: string;
  image_path?: string | null;
  date_of_birth?: string | null;
};

/**
 * `topscorers/seasons/{id}?filters=seasonTopscorerTypes:{id}` satırı — Faz 3'te
 * gerçek istekle doğrulandı (goller=208, sarı=84, kırmızı=83; asistler=209
 * dokümandan, bu görev kapsamında ayrıca test edilmedi).
 */
export type SportmonksTopscorerRow = {
  id: number;
  season_id: number;
  player_id: number;
  type_id: number;
  position: number;
  total: number;
  participant_id: number;
  player?: SportmonksPlayer;
  participant?: SportmonksStandingParticipant;
};

/** `leagues/{id}?include=seasons` satırı — Pass 4'te doğrulandı. */
export type SportmonksSeasonRow = {
  id: number;
  name: string;
  starting_at?: string;
  ending_at?: string;
  is_current?: boolean;
  finished?: boolean;
};

/** `squads/teams/{id}?include=player` satırı — Pass 4'te doğrulandı. */
/**
 * `GET /squads/seasons/{sid}/teams/{tid}?include=player.statistics.details&filters=playerStatisticSeasons:{sid}`
 * (2026-09-19, gerçek Süper Lig verisi) — oyuncunun sezon istatistikleri. `type_id 321` = APPEARANCES
 * (`value: { total }`), 322 = LINEUPS, 79 = ASSISTS, 119 = MINUTES_PLAYED. `PlayerStatistic` kota havuzu.
 */
export type SportmonksPlayerStatisticDetail = { type_id: number; value?: { total?: number } | number | string | null };
export type SportmonksPlayerStatistic = {
  season_id: number;
  team_id?: number;
  player_id?: number;
  details?: SportmonksPlayerStatisticDetail[];
};
export type SportmonksSquadStatsRow = {
  id?: number;
  player_id: number;
  team_id?: number;
  season_id?: number;
  player?: { id: number; display_name?: string; name?: string; image_path?: string | null; detailed_position_id?: number | null; statistics?: SportmonksPlayerStatistic[] };
};

export type SportmonksSquadRow = {
  id: number;
  player_id: number;
  team_id: number;
  position_id?: number;
  jersey_number?: number;
  captain?: boolean;
  start?: string | null;
  end?: string | null;
  player?: SportmonksPlayer;
};
