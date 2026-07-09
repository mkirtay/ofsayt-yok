import type { IncomingMessage } from 'http';
import type { MatchAnalysis } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { prisma } from '@/lib/prisma';
import { livescoreServerClient } from '@/server/livescoreInternalAxios';
import { runWithLiveScoreHttpClient } from '@/services/liveScoreHttpContext';
import { resolveLiveMatch } from '@/lib/resolveLiveMatch';

type MatchPredictionJson = { home?: number; draw?: number; away?: number };
type ScorePredictionJson = { mostLikely?: string };
type GoalExpectationJson = {
  over25?: number;
  over35?: number;
  btts?: number;
  htOver05?: number;
  htOver15?: number;
  homeToScore?: number;
  awayToScore?: number;
  bttsFirstHalf?: number;
};

type ExtendedPredictions = {
  over35: number;
  htOver05: number;
  htOver15: number;
  homeToScore: number;
  awayToScore: number;
  bttsFirstHalf: number;
};

function parseMatchPrediction(json: unknown): {
  home: number;
  draw: number;
  away: number;
} | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as MatchPredictionJson;
  const home = Number(o.home);
  const draw = Number(o.draw);
  const away = Number(o.away);
  if (![home, draw, away].every(Number.isFinite)) return null;
  return { home, draw, away };
}

function parseScorePrediction(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const raw = (json as ScorePredictionJson).mostLikely;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return raw.trim().replace(/\s/g, '');
}

function parseGoalExpectation(json: unknown): { over25: number; btts: number } {
  if (!json || typeof json !== 'object') return { over25: 0, btts: 0 };
  const o = json as GoalExpectationJson;
  return {
    over25: Number.isFinite(Number(o.over25)) ? Number(o.over25) : 0,
    btts: Number.isFinite(Number(o.btts)) ? Number(o.btts) : 0,
  };
}

function parseExtendedPredictions(json: unknown): ExtendedPredictions {
  const o = (json && typeof json === 'object' ? (json as GoalExpectationJson) : {}) as GoalExpectationJson;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    over35: num(o.over35),
    htOver05: num(o.htOver05),
    htOver15: num(o.htOver15),
    homeToScore: num(o.homeToScore),
    awayToScore: num(o.awayToScore),
    bttsFirstHalf: num(o.bttsFirstHalf),
  };
}

/** PRE analizinden tahmin kaydı oluşturur (yoksa). */
export async function ensurePredictionRecordForAnalysis(
  analysis: Pick<
    MatchAnalysis,
    | 'id'
    | 'matchId'
    | 'matchStatus'
    | 'homeTeamName'
    | 'awayTeamName'
    | 'matchPrediction'
    | 'scorePrediction'
    | 'goalExpectation'
    | 'modelVersion'
  >
): Promise<boolean> {
  if (analysis.matchStatus !== 'PRE') {
    return false;
  }

  const existing = await prisma.predictionRecord.findUnique({
    where: { matchAnalysisId: analysis.id },
  });
  if (existing) return false;

  const mp = parseMatchPrediction(analysis.matchPrediction);
  const score = parseScorePrediction(analysis.scorePrediction);
  if (!mp || !score) return false;

  const ge = parseGoalExpectation(analysis.goalExpectation);
  const extended = parseExtendedPredictions(analysis.goalExpectation);

  await prisma.predictionRecord.create({
    data: {
      matchAnalysisId: analysis.id,
      matchId: analysis.matchId,
      matchLabel: `${analysis.homeTeamName} - ${analysis.awayTeamName}`,
      predictedHomePct: mp.home,
      predictedDrawPct: mp.draw,
      predictedAwayPct: mp.away,
      predictedScore: score,
      predictedOver25: ge.over25,
      predictedBtts: ge.btts,
      extendedPredictions: extended,
      modelVersion: analysis.modelVersion,
    },
  });
  return true;
}

/** Eski analizler için eksik PredictionRecord satırlarını oluşturur. */
export async function backfillMissingPredictionRecords(): Promise<number> {
  const missing = await prisma.matchAnalysis.findMany({
    where: {
      matchStatus: 'PRE',
      predictionRecord: null,
    },
    select: {
      id: true,
      matchId: true,
      matchStatus: true,
      homeTeamName: true,
      awayTeamName: true,
      matchPrediction: true,
      scorePrediction: true,
      goalExpectation: true,
      modelVersion: true,
    },
  });

  let created = 0;
  for (const row of missing) {
    try {
      const ok = await ensurePredictionRecordForAnalysis(row);
      if (ok) created += 1;
    } catch {
      // Yarış durumu / tekrar — yoksay
    }
  }
  return created;
}

export function predictedOutcomeFromPct(
  home: number,
  draw: number,
  away: number
): 'HOME' | 'DRAW' | 'AWAY' {
  const max = Math.max(home, draw, away);
  if (home === max) return 'HOME';
  if (draw === max) return 'DRAW';
  return 'AWAY';
}

export type EvaluatePredictionsResult = {
  evaluated: number;
  skipped: number;
  errors: number;
};

function parseScoreGoals(raw?: string | null): [number, number] | null {
  if (!raw) return null;
  const m = /(\d+)\s*[-:]\s*(\d+)/.exec(String(raw));
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

function isMatchFinished(match: Match | null): boolean {
  if (!match) return false;
  const s = String(match.status ?? '').toUpperCase();
  return s === 'FINISHED' || s === 'FT' || s === 'FULL TIME' || s === 'ENDED';
}

function extractFinalScore(match: Match): string | null {
  const raw = match.scores?.ft_score || match.scores?.score || match.score;
  const goals = parseScoreGoals(raw);
  if (!goals) return null;
  return `${goals[0]}-${goals[1]}`;
}

function extractHtScore(match: Match): [number, number] | null {
  return parseScoreGoals(match.scores?.ht_score);
}

function normalizePredictedScore(raw: string): string {
  return raw.trim().replace(/\s/g, '').replace(':', '-');
}

async function resolveMatchForEvaluation(
  matchId: string,
  cache: Map<string, Match | null>
): Promise<Match | null> {
  if (cache.has(matchId)) return cache.get(matchId) ?? null;

  const resolved = await resolveLiveMatch(matchId);
  const match = resolved?.match ?? null;
  cache.set(matchId, match);
  if (resolved?.apiMatchId && resolved.apiMatchId !== matchId) {
    cache.set(resolved.apiMatchId, match);
  }
  return match;
}

/** Biten maçların kayıtlı tahminlerini gerçek skorla karşılaştırır. */
export async function evaluatePendingPredictionRecords(
  req: IncomingMessage
): Promise<EvaluatePredictionsResult> {
  await backfillMissingPredictionRecords();

  const pending = await prisma.predictionRecord.findMany({
    where: { evaluatedAt: null },
    select: {
      id: true,
      matchId: true,
      predictedHomePct: true,
      predictedDrawPct: true,
      predictedAwayPct: true,
      predictedScore: true,
      predictedOver25: true,
      predictedBtts: true,
      extendedPredictions: true,
    },
  });

  const result: EvaluatePredictionsResult = { evaluated: 0, skipped: 0, errors: 0 };
  if (!pending.length) return result;

  const client = livescoreServerClient();
  const matchCache = new Map<string, Match | null>();

  await runWithLiveScoreHttpClient(client, async () => {
    for (const record of pending) {
      try {
        const match = await resolveMatchForEvaluation(record.matchId, matchCache);

        if (!isMatchFinished(match)) {
          result.skipped += 1;
          continue;
        }

        const actualScore = extractFinalScore(match!);
        if (!actualScore) {
          result.skipped += 1;
          continue;
        }

        const [homeGoals, awayGoals] = actualScore.split('-').map(Number);
        const actualResult =
          homeGoals! > awayGoals! ? 'HOME' : homeGoals! < awayGoals! ? 'AWAY' : 'DRAW';
        const totalGoals = homeGoals! + awayGoals!;
        const actualOver25 = totalGoals > 2;
        const actualBtts = homeGoals! > 0 && awayGoals! > 0;

        const predictedResult = predictedOutcomeFromPct(
          record.predictedHomePct,
          record.predictedDrawPct,
          record.predictedAwayPct
        );

        const result1x2Hit = predictedResult === actualResult;
        const scoreExactHit = normalizePredictedScore(record.predictedScore) === actualScore;
        const over25Hit = (record.predictedOver25 >= 50) === actualOver25;
        const bttsHit = (record.predictedBtts >= 50) === actualBtts;

        const ht = extractHtScore(match!);
        const extendedPredictions = record.extendedPredictions as
          | Partial<ExtendedPredictions>
          | null;

        const extendedHits: Record<string, boolean | null> = {
          over35Hit: null,
          htOver05Hit: null,
          htOver15Hit: null,
          homeToScoreHit: null,
          awayToScoreHit: null,
          bttsFirstHalfHit: null,
        };

        if (extendedPredictions) {
          const actualOver35 = totalGoals > 3;
          if (typeof extendedPredictions.over35 === 'number') {
            extendedHits.over35Hit = (extendedPredictions.over35 >= 50) === actualOver35;
          }
          const actualHomeToScore = homeGoals! > 0;
          if (typeof extendedPredictions.homeToScore === 'number') {
            extendedHits.homeToScoreHit =
              (extendedPredictions.homeToScore >= 50) === actualHomeToScore;
          }
          const actualAwayToScore = awayGoals! > 0;
          if (typeof extendedPredictions.awayToScore === 'number') {
            extendedHits.awayToScoreHit =
              (extendedPredictions.awayToScore >= 50) === actualAwayToScore;
          }

          if (ht) {
            const [htHome, htAway] = ht;
            const htTotal = htHome + htAway;
            const actualHtOver05 = htTotal > 0;
            const actualHtOver15 = htTotal > 1;
            const actualBttsFirstHalf = htHome > 0 && htAway > 0;
            if (typeof extendedPredictions.htOver05 === 'number') {
              extendedHits.htOver05Hit = (extendedPredictions.htOver05 >= 50) === actualHtOver05;
            }
            if (typeof extendedPredictions.htOver15 === 'number') {
              extendedHits.htOver15Hit = (extendedPredictions.htOver15 >= 50) === actualHtOver15;
            }
            if (typeof extendedPredictions.bttsFirstHalf === 'number') {
              extendedHits.bttsFirstHalfHit =
                (extendedPredictions.bttsFirstHalf >= 50) === actualBttsFirstHalf;
            }
          }
        }

        await prisma.predictionRecord.update({
          where: { id: record.id },
          data: {
            actualResult,
            actualScore,
            actualOver25,
            actualBtts,
            result1x2Hit,
            scoreExactHit,
            extendedHits: { over25Hit, bttsHit, ...extendedHits },
            evaluatedAt: new Date(),
          },
        });

        result.evaluated += 1;
      } catch (e) {
        console.error('evaluatePendingPredictionRecords', record.matchId, e);
        result.errors += 1;
      }
    }
  });

  return result;
}
