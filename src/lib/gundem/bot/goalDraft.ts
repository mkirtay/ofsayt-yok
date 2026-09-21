/**
 * Gol → Gündem post TASLAĞI (yalnızca üretir; YAYINLAMAZ, DB'ye yazmaz). Otomatik/canlı akış YOK: taslak elle
 * (`GET /api/admin/gundem/bot-goal-draft`) üretilir, yayın için ayrıca `bot-post` çağrılır (Adım 3'te onay kuyruğu).
 *
 * TODO(Adım 3 — VAR): VAR ile iptal edilen gol event listesinden kalkabilir ya da ardından bir VAR (type 10) olayı
 * gelebilir. Taslak `fetchedAt` anındaki veriye dayanır; onay kuyruğu, taslağı YAYINLAMADAN ÖNCE fixture'ı yeniden
 * çekip aynı `eventId`'nin hâlâ gol olarak listede olduğunu (ve sonrasında VAR olayı olmadığını) doğrulamalı; aksi
 * halde taslak REDDEDİLMELİ. Bu dosya bu kontrolü kasıtlı olarak yapmaz.
 */
import { POST_MAX_LENGTH } from '@/config/gundem';
import { GOAL_TOPSCORER_TYPE_ID } from '@/services/sportmonksKatman2Mapper';
import { checkFilteredResult } from '@/services/sportmonks/filterAssertion';
import { sportmonksClientRequest, sportmonksCollectAllPages } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture, SportmonksTopscorerRow } from '@/services/sportmonks/types';
import { computeStanding, eventsUpTo, goalKindOf, isCreditedGoal, scoreAtEvent, type SeasonScorer } from './goalStanding';
import { leagueDisplayName } from './leagueNames';
import { renderGoalPost, type GoalFacts } from './goalTemplates';

export type GoalDraft = {
  externalKey: string;
  body: string;
  matchId: string;
  teamId: number | null;
  facts: GoalFacts;
  warnings: string[];
  fetchedAt: string;
};

export type GoalDraftResult =
  | ({ ok: true } & GoalDraft)
  | { ok: false; reason: 'event-not-found' | 'not-a-goal' | 'missing-player-name' | 'missing-participants' };

export type GoalDraftInput = {
  fixture: SportmonksFixture;
  eventId: number;
  /** Sezon gol krallığı tablosu; null → istatistik cümlesi yazılmaz. */
  scorers: SeasonScorer[] | null;
  baselineIncludesLiveGoals?: boolean;
  now?: Date;
};

/** SAF: çekilmiş veriden taslak kurar (test edilebilir). */
export function buildGoalDraft(input: GoalDraftInput): GoalDraftResult {
  const { fixture, eventId, scorers, baselineIncludesLiveGoals } = input;
  const events = fixture.events ?? [];
  const upTo = eventsUpTo(events, eventId);
  if (!upTo) return { ok: false, reason: 'event-not-found' };
  const event = upTo[upTo.length - 1];
  const kind = goalKindOf(event);
  if (!kind) return { ok: false, reason: 'not-a-goal' };
  const playerName = event.player_name?.trim();
  if (!playerName) return { ok: false, reason: 'missing-player-name' };

  const home = fixture.participants?.find((p) => p.meta?.location === 'home');
  const away = fixture.participants?.find((p) => p.meta?.location === 'away');
  if (!home || !away) return { ok: false, reason: 'missing-participants' };

  const warnings: string[] = [];
  const s = scoreAtEvent(upTo, home.id, away.id);
  if (!s.reliable) warnings.push('score-omitted: kendi kalesine gol / bilinmeyen takım (skor güvenilmez)');

  let milestone: GoalFacts['milestone'] = null;
  if (isCreditedGoal(event)) {
    if (scorers) {
      milestone = computeStanding({
        scorerId: event.player_id as number,
        baseline: scorers,
        upToEvent: upTo,
        baselineIncludesLiveGoals,
      }).milestone;
    } else {
      warnings.push('standing-omitted: sezon golcü tablosu alınamadı');
    }
  }

  const leagueName = leagueDisplayName(fixture.league_id ?? fixture.league?.id, fixture.league?.name);
  if (milestone && !leagueName) warnings.push('standing-omitted: lig adı yok');

  const scorerTeam = kind === 'own-goal' ? null : fixture.participants?.find((p) => p.id === event.participant_id) ?? null;
  const facts: GoalFacts = {
    kind,
    playerName,
    teamName: scorerTeam?.name ?? null,
    minute: event.minute,
    extraMinute: event.extra_minute ?? null,
    homeName: home.name,
    awayName: away.name,
    score: s.reliable ? { home: s.home, away: s.away } : null,
    leagueName,
    milestone,
  };
  const body = renderGoalPost(facts);
  if (body.length > POST_MAX_LENGTH) warnings.push(`too-long: ${body.length}/${POST_MAX_LENGTH} karakter (bot-post reddeder)`);

  return {
    ok: true,
    externalKey: `goal:${fixture.id}:${event.id}`,
    body,
    matchId: String(fixture.id),
    teamId: scorerTeam?.id ?? null,
    facts,
    warnings,
    fetchedAt: (input.now ?? new Date()).toISOString(),
  };
}

/** Sezon gol krallığı (yalnızca gol tipi 208; TÜM sayfalar). Filtre sessizce uygulanmadıysa veya hata olursa null. */
export async function fetchSeasonGoalScorers(seasonId: number): Promise<SeasonScorer[] | null> {
  try {
    const rows = await sportmonksCollectAllPages<SportmonksTopscorerRow>({
      basePath: 'football',
      path: `/topscorers/seasons/${seasonId}`,
      perPage: 50,
      extraParams: { filters: `seasonTopscorerTypes:${GOAL_TOPSCORER_TYPE_ID}` },
    });
    const check = checkFilteredResult(rows, [GOAL_TOPSCORER_TYPE_ID], (r) => r.type_id);
    if (!check.ok) {
      console.error('[gundem-bot] topscorers filtre uygulanmadı:', check.reason);
      return null;
    }
    return rows.filter((r) => Number.isFinite(r.total)).map((r) => ({ playerId: r.player_id, goals: r.total }));
  } catch (e) {
    console.error('[gundem-bot] topscorers alınamadı', e);
    return null;
  }
}

/**
 * Sportmonks'tan çekip taslak üretir. Maliyet: 1 istek (Fixture havuzu) + sezon başına ~2 sayfa (Topscorer havuzu).
 * `baselineIncludesLiveGoals`: env `GUNDEM_BOT_TOPSCORERS_INCLUDE_LIVE=true` ile açılır (varsayılan false; DOĞRULANMADI).
 */
export async function fetchGoalDraft(fixtureId: number, eventId: number): Promise<GoalDraftResult> {
  const envelope = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${fixtureId}`, {
    include: 'participants;league;events',
  });
  const fixture = envelope.data;
  if (!fixture) return { ok: false, reason: 'event-not-found' };
  const scorers = fixture.season_id != null ? await fetchSeasonGoalScorers(fixture.season_id) : null;
  return buildGoalDraft({
    fixture,
    eventId,
    scorers,
    baselineIncludesLiveGoals: process.env.GUNDEM_BOT_TOPSCORERS_INCLUDE_LIVE === 'true',
  });
}
