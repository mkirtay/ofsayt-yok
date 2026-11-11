/**
 * Bir günün milli maçları için AI analizi — DB'YE YAZMADAN, yalnız JSON dosyasına (kupon aracı deneme verisi).
 * Aynı prompt + aynı model; bağlam canlı modda (`historical: false`). Her maç bitince dosya atomik (tmp + rename) güncellenir.
 *   npx dotenv -e <anahtarlar.env> -- npx tsx scripts/national/gun-analizleri.ts --date 2026-11-12 --out <json> [--max 12] [--max-usd 3] [--cache <klasör>]
 */
import { renameSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { ANALYSIS_MODEL_VERSION, ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserMessage } from '../../src/config/analysisPrompt';
import { ANALYSIS_RESPONSE_FORMAT } from '../../src/config/analysisJsonSchema';
import { ANALYSIS_OPENAI_MODEL, openAiAnalysisParams, validateSchema } from '../../src/services/aiAnalysisService';
import { llmCostMicroUsd } from '../../src/server/llmCost';
import { isSeniorMenTeamName, nationalLeagueByAfId } from '../../src/config/nationalLeagues';
import { buildNationalAnalysisContext } from '../../src/server/analysisNationalContext';
import { toAppId } from '../../src/services/apiFootball/ids';
import type { AfFixture } from '../../src/services/apiFootball/types';
import { afGet, afStats } from './lib';

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : process.argv[i + 1];
};
const DATE = arg('date', '2026-11-12')!;
const OUT = arg('out')!;
const MAX = Number(arg('max', '12'));
const MAX_USD = Number(arg('max-usd', '3'));
if (!OUT) throw new Error('--out gerekli');

const isSenior = (f: AfFixture): boolean => isSeniorMenTeamName(f.teams.home.name) && isSeniorMenTeamName(f.teams.away.name);

/** Önem: UNL > Türkiye > DK/Euro elemeleri > diğer elemeler > hazırlık. */
function rank(f: AfFixture): number {
  const turkey = f.teams.home.id === 777 || f.teams.away.id === 777;
  if (f.league.id === 5) return turkey ? 0 : 1;
  if (turkey) return 2;
  if ([32, 37, 960].includes(f.league.id)) return 3;
  if (f.league.id === 10) return 6;
  return 4;
}

(async () => {
  const list = ((await afGet<AfFixture>('/fixtures', { date: DATE, timezone: 'UTC' })).response ?? [])
    .filter((f) => nationalLeagueByAfId(f.league.id) && isSenior(f) && ['NS', 'TBD'].includes(f.fixture.status.short))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.fixture.date) - Date.parse(b.fixture.date))
    .slice(0, MAX);
  console.log(`${DATE}: ${list.length} maç seçildi`);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const out: unknown[] = [];
  let spent = 0;
  for (const fx of list) {
    if (spent / 1e6 > MAX_USD) {
      console.log('Harcama sınırı → durdu');
      break;
    }
    const id = String(toAppId(fx.fixture.id));
    try {
      const ctx = await buildNationalAnalysisContext(id, { get: afGet, fixture: fx });
      if (!ctx || ctx.archived) throw new Error('bağlam yok');
      const gaps = ['sakat/cezalı', 'muhtemel 11', 'hakem istatistiği', 'hava', 'derbi', 'dış oran sinyali'];
      if (!ctx.h2h) gaps.push('H2H');
      if (!ctx.standings) gaps.push('puan durumu');
      for (const t of [ctx.homeTeam, ctx.awayTeam]) if (t.recentMatches.length < 5) gaps.push(`son maçlar (<5): ${t.teamName}`);
      if (ctx.lineups) gaps.splice(gaps.indexOf('muhtemel 11'), 1);
      const res = await openai.chat.completions.create(
        {
          model: ANALYSIS_OPENAI_MODEL,
          ...openAiAnalysisParams(ANALYSIS_OPENAI_MODEL),
          max_completion_tokens: 3000,
          response_format: ANALYSIS_RESPONSE_FORMAT,
          messages: [
            { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
            { role: 'user', content: buildAnalysisUserMessage(ctx) },
          ],
        },
        { signal: AbortSignal.timeout(60_000) },
      );
      spent += llmCostMicroUsd(ANALYSIS_OPENAI_MODEL, {
        input: res.usage?.prompt_tokens ?? 0,
        cached: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        output: res.usage?.completion_tokens ?? 0,
      });
      const an = validateSchema(JSON.parse(res.choices[0]?.message?.content ?? ''));
      const g = an.goalExpectation;
      out.push({
        matchId: id,
        homeTeamName: ctx.match.home?.name,
        awayTeamName: ctx.match.away?.name,
        competitionName: ctx.match.competition?.name,
        kickoffIso: fx.fixture.date,
        modelVersion: `${ANALYSIS_MODEL_VERSION}-openai:${ANALYSIS_OPENAI_MODEL}-national-adapter`,
        generatedAt: new Date().toISOString(),
        source: 'test-dryrun',
        contextGaps: gaps,
        matchPrediction: { home: an.matchPrediction.home, draw: an.matchPrediction.draw, away: an.matchPrediction.away },
        goalExpectation: {
          over15: g.over15,
          over25: g.over25,
          over35: g.over35,
          btts: g.btts,
          htOver05: g.htOver05,
          htOver15: g.htOver15,
          homeToScore: g.homeToScore,
          awayToScore: g.awayToScore,
          bttsFirstHalf: g.bttsFirstHalf,
        },
      });
      writeFileSync(`${OUT}.tmp`, JSON.stringify(out, null, 1));
      renameSync(`${OUT}.tmp`, OUT);
      console.log(`✓ ${out.length}/${list.length} ${ctx.match.home?.name} - ${ctx.match.away?.name} (${an.matchPrediction.home}/${an.matchPrediction.draw}/${an.matchPrediction.away})`);
    } catch (e) {
      console.log(`✗ ${fx.fixture.id} ${fx.teams.home.name}-${fx.teams.away.name}: ${(e as Error).message.slice(0, 150)}`);
    }
  }
  console.log(`Bitti: ${out.length} analiz · OpenAI $${(spent / 1e6).toFixed(4)} · AF ${afStats.requests} istek (+${afStats.cacheHits} önbellek)`);
})();
