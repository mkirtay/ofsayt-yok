/**
 * Geçmiş sezonun maçları — `GET /football/schedules/seasons/{seasonId}/teams/{teamId}` (turnuva-sezon başına
 * tek istek, `Stage` kota havuzu; include gerekmez: katılımcılar ve skorlar gömülü gelir).
 *
 * 2026-10-02'de GS 2025/26 ile doğrulandı: Süper Lig 34, Şampiyonlar Ligi 12, Türkiye Kupası 5 maç — takım
 * istatistiklerindeki maç sayılarıyla birebir. Maçlar üç yerde gelir:
 *  - lig / lig aşaması: `stage.rounds[].fixtures`
 *  - eleme turları (iki ayaklı): `stage.aggregates[].fixtures` (ya da `round.aggregates[].fixtures`)
 *  - tek maçlık tur / kupa grup aşaması: `stage.fixtures`
 * Yanıtta `league` yok (yalnız `league_id`) → lig adı/logosu takımın sezon listesinden (`seasons.league`) eklenir.
 */
import type { SportmonksFixture } from './types';
import type { TeamMatch, TeamSeasonRef } from './teamOverview';
import { toTeamMatch } from './teamOverview';

type WithFixtures = { fixtures?: SportmonksFixture[] | null };
type Aggregate = WithFixtures;
type Round = WithFixtures & { aggregates?: Aggregate[] | null };
export type SportmonksScheduleStage = WithFixtures & {
  id?: number;
  finished?: boolean | null;
  rounds?: Round[] | null;
  aggregates?: Aggregate[] | null;
};

/** Programdaki tüm maçlar (tekil). */
export function collectScheduleFixtures(stages: SportmonksScheduleStage[] | null | undefined): SportmonksFixture[] {
  const byId = new Map<number, SportmonksFixture>();
  const add = (list: SportmonksFixture[] | null | undefined) => {
    for (const f of list ?? []) if (f?.id != null) byId.set(f.id, f);
  };
  for (const st of stages ?? []) {
    add(st.fixtures);
    for (const a of st.aggregates ?? []) add(a.fixtures);
    for (const r of st.rounds ?? []) {
      add(r.fixtures);
      for (const a of r.aggregates ?? []) add(a.fixtures);
    }
  }
  return [...byId.values()];
}

/** Bütün aşamalar bitmiş mi (önbellek: bitmiş sezon 30 gün). Boş program bitmiş sayılmaz. */
export function isScheduleFinished(stages: SportmonksScheduleStage[] | null | undefined): boolean {
  const list = stages ?? [];
  return list.length > 0 && list.every((st) => st.finished === true);
}

/** Bir turnuva-sezonun programı → takımın maçları (lig adı/logosu `season`'dan). */
export function mapTeamSchedule(stages: SportmonksScheduleStage[] | null | undefined, season: TeamSeasonRef, teamId: number): TeamMatch[] {
  const league = { id: season.leagueId, name: season.leagueName ?? '', image_path: season.leagueLogo ?? null };
  return collectScheduleFixtures(stages)
    .filter((f) => (f.participants ?? []).some((p) => p.id === teamId))
    .map((f) => toTeamMatch({ ...f, league: f.league ?? (league as SportmonksFixture['league']) }));
}

/** Birden çok turnuvanın maçları → tekil, en yeniden eskiye. */
export function mergeSeasonMatches(lists: TeamMatch[][]): TeamMatch[] {
  const byId = new Map<number, TeamMatch>();
  for (const list of lists) for (const m of list) byId.set(m.id, m);
  const key = (m: TeamMatch) => {
    if (m.kickoff_ts != null) return m.kickoff_ts;
    const t = Date.parse(`${m.date ?? ''}T${m.scheduled ?? '00:00'}:00Z`);
    return Number.isFinite(t) ? t : 0;
  };
  return [...byId.values()].sort((a, b) => key(b) - key(a));
}
