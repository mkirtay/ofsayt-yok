/**
 * Sportmonks `SportmonksFixture` (ortak `/livescores/inplay`, `/fixtures/date/{date}`,
 * `/fixtures/between/{from}/{to}` şekli) → mevcut `Match` modeli.
 *
 * docs/SPORTMONKS_MIGRATION.md Pass 1-3'te doğrulanan her alan eşlemesi için ilgili
 * `src/services/sportmonks/*.ts` yardımcı modülü kullanılır — bu dosya sadece onları
 * `Match` şekline birleştiren "son adım". Her yardımcının kendi dosyasındaki JSDoc'ta
 * hangi rapor bölümüne/varsayıma dayandığı ayrıca not düşülü (ör. `venueFormatter.ts`
 * ve `roundStage.ts`'teki "doğrulanamadı"/"varsayım düzeltildi" notları).
 */
import type { Competition, Match, MatchCountry, Team } from '@/models/liveScore';
import type { SportmonksFixture, SportmonksParticipant } from './sportmonks/types';
import { mapSportmonksStateToPhase } from './sportmonks/stateMapping';
import { deriveMatchScore } from './sportmonks/scoreDerivation';
import { formatLiveMinuteLabel } from './sportmonks/minuteDerivation';
import { resolveRoundAndStage } from './sportmonks/roundStage';
import { formatVenueLocation } from './sportmonks/venueFormatter';
import { formatMainReferee } from './sportmonks/refereeFormatter';

/** `"2026-09-17 16:00:00"` → `{date:"2026-09-17", scheduled:"16:00"}` */
function splitStartingAt(startingAt: string | null | undefined): { date?: string; scheduled?: string } {
  if (!startingAt?.trim()) return {};
  const [datePart, timePart] = startingAt.trim().split(' ');
  const scheduled = timePart?.slice(0, 5);
  return {
    ...(datePart ? { date: datePart } : {}),
    ...(scheduled ? { scheduled } : {}),
  };
}

/**
 * Pass 1: `is_league`/`is_cup` hazır alan olarak YOK, `type` her zaman "league"
 * dönebiliyor (Türkiye Kupası bile `type:"league"` — `inplayFixture.json`) — asıl
 * ayrım `sub_type`'da (`domestic_cup`, `domestic_league`, ...).
 */
function deriveCompetitionFlags(subType: string | undefined): { is_league?: boolean; is_cup?: boolean } {
  const s = subType?.toLowerCase() ?? '';
  if (s.includes('cup')) return { is_cup: true, is_league: false };
  if (s.includes('league')) return { is_league: true, is_cup: false };
  return {};
}

function mapParticipantToTeam(participant: SportmonksParticipant | undefined): Team {
  return {
    id: participant?.id ?? 0,
    name: participant?.name ?? '',
    ...(participant?.image_path ? { logo: participant.image_path } : {}),
  };
}

function mapCompetition(fixture: SportmonksFixture): Competition | undefined {
  const league = fixture.league;
  if (!league) {
    return fixture.league_id != null ? { id: fixture.league_id, name: '' } : undefined;
  }
  return {
    id: league.id,
    name: league.name,
    ...(league.image_path ? { logo: league.image_path } : {}),
    ...deriveCompetitionFlags(league.sub_type),
  };
}

function mapCountry(fixture: SportmonksFixture): MatchCountry | undefined {
  const country = fixture.league?.country;
  if (!country) return undefined;
  return {
    id: country.id,
    name: country.name,
    ...(country.image_path ? { flag: country.image_path } : {}),
    ...(country.fifa_name ? { fifa_code: country.fifa_name } : {}),
  };
}

/**
 * Not: `fixture_id` bilinçli olarak set EDİLMİYOR — Pass 1 Genel Bulgu 2'ye göre
 * Sportmonks'ta tüm endpoint'ler zaten aynı `id`'yi kullanıyor, eski
 * fikstür/history/canlı reconciliation katmanı (`fixture_id` eşleştirmesi)
 * bu sağlayıcı için gereksiz (bkz. liveScoreService.ts `mergeMatchesByIdForAllTab`).
 */
export function mapSportmonksFixtureToMatch(fixture: SportmonksFixture): Match {
  const home = fixture.participants?.find((p) => p.meta?.location === 'home');
  const away = fixture.participants?.find((p) => p.meta?.location === 'away');
  const stateId = fixture.state?.id ?? fixture.state_id;
  const status = stateId != null ? mapSportmonksStateToPhase(stateId) : 'NOT STARTED';
  const minuteLabel = formatLiveMinuteLabel(fixture.periods);
  const matchScore = deriveMatchScore(fixture.scores);
  const { date, scheduled } = splitStartingAt(fixture.starting_at);
  const roundStage = resolveRoundAndStage(fixture);
  const location = formatVenueLocation(fixture.venue);
  const referee = formatMainReferee(fixture.referees);
  const competition = mapCompetition(fixture);
  const country = mapCountry(fixture);

  return {
    id: fixture.id,
    status,
    time: minuteLabel ?? '',
    home: mapParticipantToTeam(home),
    away: mapParticipantToTeam(away),
    ...(date !== undefined ? { date } : {}),
    ...(scheduled !== undefined ? { scheduled } : {}),
    ...(matchScore ? { scores: matchScore } : {}),
    ...(location !== null ? { location } : {}),
    ...(referee !== null ? { referee } : {}),
    ...(competition ? { competition } : {}),
    ...(fixture.season_id != null ? { season_id: fixture.season_id } : {}),
    ...(country ? { country } : {}),
    ...(fixture.group?.name ? { group_name: fixture.group.name } : {}),
    ...(fixture.group?.id != null ? { group_id: fixture.group.id } : {}),
    ...(roundStage.round !== null ? { round: roundStage.round } : {}),
    ...(roundStage.stage !== null ? { stage: roundStage.stage } : {}),
  };
}
