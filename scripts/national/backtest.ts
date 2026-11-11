/**
 * Milli maç AI analizi — GERİYE DÖNÜK TEST (backtest). DB / Redis YOK: sonuçlar yalnız bellekte ve çıktı dosyasında.
 *
 * Akış: bitmiş milli maçlar seç → bağlamı maçtan ÖNCEKİ veriyle kur (`historical: true`, sızıntısız) → AYNI prompt + AYNI model
 * (`ANALYSIS_SYSTEM_PROMPT`, `ANALYSIS_OPENAI_MODEL`, aynı parametreler) ile analiz üret → 12 pazarın olasılıklarını gerçek
 * 90 dk sonucuyla karşılaştır → kalibrasyon tablosu + "en güçlü 3 tahmin" isabeti (kulüp referansı yanında).
 *
 * Çalıştırma (yalnız API_FOOTBALL_KEY ve OPENAI_API_KEY içeren bir env dosyasıyla; prod DB/Redis anahtarı VERMEYİN):
 *   npx dotenv -e <anahtarlar.env> -- npx tsx scripts/national/backtest.ts [--limit 40] [--max-usd 5] [--dry] [--cache <klasör>] [--out <json>]
 * `--dry`: seçim + bağlam kurulumu + tahmini maliyet; OpenAI çağrısı YOK. Tahmini maliyet --max-usd'yi aşarsa DURUR.
 * AF yanıtları `--cache` klasöründe saklanır (tekrar koşuda ek AF isteği harcanmaz).
 *
 * Seçim: Türkiye'nin 2026'daki bitmiş maçları + UEFA Uluslar Ligi 2026, DK Elemeleri Avrupa (sezon 2024 = 2025 maçları),
 * hazırlıklar 2026, Dünya Kupası 2026'dan tarihe eşit aralıklı örnek (rastgelelik yok → tekrarlanabilir).
 */
import { writeFileSync } from 'node:fs';
import OpenAI from 'openai';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserMessage, type AnalysisJsonSchema } from '../../src/config/analysisPrompt';
import { ANALYSIS_RESPONSE_FORMAT } from '../../src/config/analysisJsonSchema';
import { ANALYSIS_OPENAI_MODEL, openAiAnalysisParams, validateSchema } from '../../src/services/aiAnalysisService';
import { llmCostMicroUsd } from '../../src/server/llmCost';
import { isSeniorMenTeamName } from '../../src/config/nationalLeagues';
import { afGet, afStats } from './lib';
import { buildNationalAnalysisContext, isFinishedFixture } from '../../src/server/analysisNationalContext';
import { pickTopPredictions, type TopPickKey } from '../../src/utils/analysisTopPicks';
import { findGamblingTerms } from '../../src/utils/gamblingTerms';
import { toAppId } from '../../src/services/apiFootball/ids';
import type { AfFixture } from '../../src/services/apiFootball/types';

const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? d : (process.argv[i + 1]?.startsWith('--') || process.argv[i + 1] === undefined ? 'true' : process.argv[i + 1]);
};
const LIMIT = Number(arg('limit', '40'));
const MAX_USD = Number(arg('max-usd', '5'));
const DRY = arg('dry') === 'true';
const OUT = arg('out');
const TURKEY_AF = 777;
const CONCURRENCY = 2;
void arg;

/* ───────────────────────── Seçim ───────────────────────── */

const SOURCES: Array<{ label: string; league: number; season: number; quota: number }> = [
  { label: 'UEFA Uluslar Ligi 2026', league: 5, season: 2026, quota: 9 },
  { label: 'DK Elemeleri Avrupa (2025 maçları)', league: 32, season: 2024, quota: 10 },
  { label: 'Hazırlık 2026', league: 10, season: 2026, quota: 7 },
  { label: 'Dünya Kupası 2026', league: 1, season: 2026, quota: 5 },
];

const usable = (f: AfFixture) =>
  isFinishedFixture(f) &&
  f.score.fulltime?.home != null &&
  f.score.halftime?.home != null &&
  isSeniorMenTeamName(f.teams.home.name) &&
  isSeniorMenTeamName(f.teams.away.name) &&
  !/preliminary/i.test(f.league.round ?? '');

function evenly<T>(list: T[], n: number): T[] {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]!);
}

async function selectMatches(limit: number): Promise<Array<{ fx: AfFixture; source: string }>> {
  const chosen = new Map<number, { fx: AfFixture; source: string }>();
  // Türkiye 2026 (+2025 hazırlıkları hariç): bitmiş tüm maçlar
  const tr = ((await afGet<AfFixture>('/fixtures', { team: TURKEY_AF, season: 2026, timezone: 'UTC' })).response ?? []).filter(usable);
  for (const fx of tr) chosen.set(fx.fixture.id, { fx, source: 'Türkiye' });
  for (const s of SOURCES) {
    const all = ((await afGet<AfFixture>('/fixtures', { league: s.league, season: s.season, timezone: 'UTC' })).response ?? [])
      .filter((f) => usable(f) && f.teams.home.id !== TURKEY_AF && f.teams.away.id !== TURKEY_AF && !chosen.has(f.fixture.id))
      // Çok erken maçlar (ilk hafta) bağlamsız kalır: UNL'de 2. hafta ve sonrası, diğerlerinde tarih sırasının ilk %15'i atlanır.
      .sort((a, b) => Date.parse(a.fixture.date) - Date.parse(b.fixture.date));
    const pool = s.league === 5 ? all.filter((f) => !/- 1$/.test(f.league.round ?? '')) : all.slice(Math.floor(all.length * 0.15));
    for (const fx of evenly(pool, Math.round((s.quota * limit) / 40))) chosen.set(fx.fixture.id, { fx, source: s.label });
  }
  return [...chosen.values()].sort((a, b) => Date.parse(a.fx.fixture.date) - Date.parse(b.fx.fixture.date)).slice(0, limit);
}

/* ───────────────────────── Değerlendirme ───────────────────────── */

const MARKETS: Array<{ key: TopPickKey; label: string }> = [
  { key: 'home', label: 'Ev sahibi kazanır' },
  { key: 'draw', label: 'Beraberlik' },
  { key: 'away', label: 'Deplasman kazanır' },
  { key: 'over15', label: '2+ gol' },
  { key: 'over25', label: '3+ gol' },
  { key: 'over35', label: '4+ gol' },
  { key: 'btts', label: 'İki takım da gol atar' },
  { key: 'htOver05', label: 'İlk yarıda gol' },
  { key: 'htOver15', label: 'İlk yarıda 2+ gol' },
  { key: 'homeToScore', label: 'Ev sahibi gol bulur' },
  { key: 'awayToScore', label: 'Deplasman gol bulur' },
  { key: 'bttsFirstHalf', label: 'İlk yarı iki takım da gol' },
];

type Truth = { ft: [number, number]; ht: [number, number] };
function truthOf(f: AfFixture): Truth {
  return { ft: [f.score.fulltime!.home!, f.score.fulltime!.away!], ht: [f.score.halftime!.home!, f.score.halftime!.away!] };
}
function occurred(key: TopPickKey, t: Truth): boolean {
  const [h, a] = t.ft;
  const [hh, ha] = t.ht;
  switch (key) {
    case 'home': return h > a;
    case 'draw': return h === a;
    case 'away': return a > h;
    case 'over15': return h + a >= 2;
    case 'over25': return h + a >= 3;
    case 'over35': return h + a >= 4;
    case 'btts': return h > 0 && a > 0;
    case 'htOver05': return hh + ha >= 1;
    case 'htOver15': return hh + ha >= 2;
    case 'homeToScore': return h > 0;
    case 'awayToScore': return a > 0;
    case 'bttsFirstHalf': return hh > 0 && ha > 0;
  }
}
function probOf(an: AnalysisJsonSchema, key: TopPickKey): number | null {
  const v = key === 'home' || key === 'draw' || key === 'away' ? an.matchPrediction?.[key] : an.goalExpectation?.[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Wilson %95 güven aralığı. */
function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - m), Math.min(1, c + m)];
}
const pct = (x: number, d = 1) => `%${(x * 100).toFixed(d)}`;

type Row = { id: number; label: string; source: string; date: string; ft: string; analysis: AnalysisJsonSchema; tokensIn: number; tokensOut: number; truth: Truth };

function report(rows: Row[]): string {
  const out: string[] = [];
  const pairs = rows.flatMap((r) => {
    const t = r.truth;
    return MARKETS.map((m) => ({ row: r, key: m.key, p: probOf(r.analysis, m.key), y: occurred(m.key, t) })).filter((x): x is { row: Row; key: TopPickKey; p: number; y: boolean } => x.p != null);
  });
  out.push(`### Pazar bazında (n = ${rows.length} maç)\n`, '| Pazar | Ort. tahmin | Gerçekleşme | Brier | Yön isabeti (≥%50) |', '|---|---:|---:|---:|---:|');
  for (const m of MARKETS) {
    const xs = pairs.filter((x) => x.key === m.key);
    if (!xs.length) continue;
    const avg = xs.reduce((s, x) => s + x.p, 0) / xs.length / 100;
    const freq = xs.filter((x) => x.y).length / xs.length;
    const brier = xs.reduce((s, x) => s + (x.p / 100 - (x.y ? 1 : 0)) ** 2, 0) / xs.length;
    const dir = xs.filter((x) => (x.p >= 50) === x.y).length / xs.length;
    out.push(`| ${m.label} | ${pct(avg, 0)} | ${pct(freq, 0)} | ${brier.toFixed(3)} | ${pct(dir, 0)} |`);
  }

  const bins: Array<[number, number, string, string]> = [
    [0, 45, '<45', ''],
    [45, 55, '45-54', '%55 → %62'],
    [55, 65, '55-64', ''],
    [65, 75, '65-74', '%65 → %71'],
    [75, 85, '75-84', '%75 → %77'],
    [85, 101, '85+', '%85 → %90'],
  ];
  out.push('\n### Kalibrasyon (12 pazar birlikte; tahmin edilen olasılığa göre)\n', '| Aralık | n | Ort. tahmin | Gerçekleşen | %95 aralık | Kulüp referansı (tahmin → gerçek) |', '|---|---:|---:|---:|---|---|');
  for (const [lo, hi, label, ref] of bins) {
    const xs = pairs.filter((x) => x.p >= lo && x.p < hi);
    if (!xs.length) continue;
    const k = xs.filter((x) => x.y).length;
    const [a, b] = wilson(k, xs.length);
    out.push(`| ${label} | ${xs.length} | ${pct(xs.reduce((s, x) => s + x.p, 0) / xs.length / 100, 0)} | ${pct(k / xs.length, 0)} | ${pct(a, 0)}–${pct(b, 0)} | ${ref} |`);
  }

  // En güçlü 3 tahmin (olay gerçekleşti mi) — kartta/AI isabet sayfasında kullanılan aynı seçim.
  let k3 = 0, n3 = 0, perMatch3 = 0, allThree = 0;
  const byRank = [0, 0, 0];
  for (const r of rows) {
    const t = r.truth;
    const top = pickTopPredictions(r.analysis, 3);
    const hits = top.map((p) => occurred(p.key, t));
    top.forEach((_, i) => { if (hits[i]) byRank[i]!++; });
    k3 += hits.filter(Boolean).length; n3 += hits.length;
    if (hits.filter(Boolean).length >= 2) perMatch3++;
    if (hits.length === 3 && hits.every(Boolean)) allThree++;
  }
  const [lo3, hi3] = wilson(k3, n3);
  out.push(
    '\n### "En güçlü 3 tahmin" isabeti\n',
    `- Madde bazında: **${k3}/${n3} = ${pct(k3 / n3)}** (%95 aralık ${pct(lo3, 0)}–${pct(hi3, 0)}) · kulüp referansı (101 maç): %82,8`,
    `- 1./2./3. sıradaki madde isabeti: ${byRank.map((c) => pct(c / rows.length, 0)).join(' / ')}`,
    `- Maçta ≥2 madde tutan: ${perMatch3}/${rows.length} (${pct(perMatch3 / rows.length, 0)}) · 3'ü birden tutan: ${allThree}/${rows.length} (${pct(allThree / rows.length, 0)})`,
  );

  // 1X2: en yüksek olasılıklı sonuç
  let hit1x2 = 0, homeWin = 0;
  for (const r of rows) {
    const t = r.truth;
    const { home, draw, away } = r.analysis.matchPrediction;
    const pick = home >= draw && home >= away ? 'home' : away >= draw ? 'away' : 'draw';
    if (occurred(pick, t)) hit1x2++;
    if (occurred('home', t)) homeWin++;
  }
  const [l1, h1] = wilson(hit1x2, rows.length);
  out.push(`- 1X2 en yüksek olasılık isabeti: ${hit1x2}/${rows.length} = ${pct(hit1x2 / rows.length)} (%95 ${pct(l1, 0)}–${pct(h1, 0)}); "hep ev sahibi" tabanı ${pct(homeWin / rows.length)}`);
  const conf = new Map<string, number>();
  for (const r of rows) conf.set(r.analysis.riskLevel, (conf.get(r.analysis.riskLevel) ?? 0) + 1);
  const avgConf = rows.reduce((s, r) => s + (Number(r.analysis.overallConfidence) || 0), 0) / rows.length;
  out.push(`- Risk seviyesi dağılımı: ${[...conf].map(([k, v]) => `${k} ${v}`).join(', ')} · ortalama genel güven ${avgConf.toFixed(0)}`);
  return out.join('\n');
}

/* ───────────────────────── Çalıştırma ───────────────────────── */

const MISSING_DATA_PHRASES = /veri(si)? (yok|bulunma|eksik)|bilgi bulunma|kadro verisi|sakat(lık)? (bilgisi|listesi) (yok|bulunma)|paylaşılmadığ/i;

async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]!, i); } }));
  return out;
}

(async () => {
  console.log(`Model: ${ANALYSIS_OPENAI_MODEL} · limit ${LIMIT} · tavan ${MAX_USD}$ · ${DRY ? 'DRY-RUN' : 'GERÇEK ÇAĞRI'}`);
  const selected = await selectMatches(LIMIT);
  console.log(`Seçilen maç: ${selected.length}`);
  for (const s of selected.map((x) => `${x.fx.fixture.date.slice(0, 10)} ${x.source.padEnd(34)} ${x.fx.teams.home.name} ${x.fx.score.fulltime?.home}-${x.fx.score.fulltime?.away} ${x.fx.teams.away.name}`)) console.log('  ' + s);

  const built = await pool(selected, CONCURRENCY, async (s) => {
    const ctx = await buildNationalAnalysisContext(String(toAppId(s.fx.fixture.id)), { get: afGet, historical: true, fixture: s.fx });
    if (!ctx || ctx.archived) throw new Error(`bağlam kurulamadı ${s.fx.fixture.id}`);
    return { s, ctx, prompt: buildAnalysisUserMessage(ctx) };
  });
  const inTok = built.map((b) => Math.ceil((ANALYSIS_SYSTEM_PROMPT.length + b.prompt.length) / 2.8));
  const estUsd = (inTok.reduce((a, t) => a + llmCostMicroUsd(ANALYSIS_OPENAI_MODEL, { input: t, output: 2_000 }), 0)) / 1e6;
  console.log(`AF: ${afStats.requests} istek (+${afStats.cacheHits} önbellekten) · ort. girdi ≈ ${Math.round(inTok.reduce((a, b) => a + b, 0) / inTok.length)} token (tahmini)`);
  console.log(`TAHMİNİ toplam OpenAI maliyeti: $${estUsd.toFixed(3)} (${built.length} analiz; çıktı 2000 token varsayımı)`);
  if (estUsd > MAX_USD) { console.log(`Tahmin ${MAX_USD}$ sınırını aşıyor → DURULDU.`); process.exit(2); }
  if (DRY) { console.log('\n--- Örnek bağlam (ilk maç) ---\n' + built[0]!.prompt.split('\n---\n')[0]); return; }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY yok');
  const openai = new OpenAI({ apiKey });
  let spent = 0;
  let violations = 0, gambling = 0, failures = 0;
  const rows: Row[] = [];
  await pool(built, CONCURRENCY, async ({ s, ctx, prompt }) => {
    if (spent / 1e6 > MAX_USD) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await openai.chat.completions.create(
          {
            model: ANALYSIS_OPENAI_MODEL,
            ...openAiAnalysisParams(ANALYSIS_OPENAI_MODEL),
            max_completion_tokens: 3000,
            response_format: ANALYSIS_RESPONSE_FORMAT,
            messages: [{ role: 'system', content: ANALYSIS_SYSTEM_PROMPT }, { role: 'user', content: prompt }],
          },
          { signal: AbortSignal.timeout(60_000) },
        );
        const input = res.usage?.prompt_tokens ?? 0;
        const output = res.usage?.completion_tokens ?? 0;
        spent += llmCostMicroUsd(ANALYSIS_OPENAI_MODEL, { input, cached: res.usage?.prompt_tokens_details?.cached_tokens ?? 0, output });
        const raw = res.choices[0]?.message?.content ?? '';
        const analysis = validateSchema(JSON.parse(raw));
        const text = JSON.stringify(analysis);
        if (MISSING_DATA_PHRASES.test(text)) violations++;
        if (findGamblingTerms(text).length) gambling++;
        rows.push({
          id: s.fx.fixture.id,
          label: `${ctx.match.home?.name} - ${ctx.match.away?.name}`,
          source: s.source,
          date: s.fx.fixture.date.slice(0, 10),
          ft: `${s.fx.score.fulltime!.home}-${s.fx.score.fulltime!.away}`,
          analysis,
          tokensIn: input,
          tokensOut: output,
          truth: truthOf(s.fx),
        });
        return;
      } catch (e) {
        if (attempt === 2) { failures++; console.log(`  ✗ ${s.fx.fixture.id}: ${(e as Error).message.slice(0, 120)}`); }
        else await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`\nÜretilen: ${rows.length}/${built.length} · başarısız ${failures} · GERÇEK OpenAI maliyeti $${(spent / 1e6).toFixed(4)} · ort. ${Math.round(rows.reduce((a, r) => a + r.tokensIn, 0) / rows.length)} girdi + ${Math.round(rows.reduce((a, r) => a + r.tokensOut, 0) / rows.length)} çıktı token`);
  console.log(`Metin denetimi: "veri yok" tarzı ifade geçen analiz ${violations}, bahis dili geçen ${gambling}`);
  console.log('\n' + report(rows));
  if (OUT) {
    writeFileSync(
      OUT,
      JSON.stringify(
        rows.map((r) => ({ id: r.id, maç: r.label, kaynak: r.source, tarih: r.date, skor90: r.ft, ht: r.truth.ht.join('-'), olasılıklar: Object.fromEntries(MARKETS.map((m) => [m.key, probOf(r.analysis, m.key)])), güven: r.analysis.overallConfidence, risk: r.analysis.riskLevel, tahminSkor: r.analysis.scorePrediction?.mostLikely })),
        null,
        1,
      ),
    );
    console.log(`\nSonuçlar yazıldı: ${OUT}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
