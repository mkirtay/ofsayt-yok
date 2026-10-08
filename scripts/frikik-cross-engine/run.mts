/**
 * Frikik simülasyonu motorlar arası karşılaştırma (Node/V8 ↔ Chromium/V8, Firefox/SpiderMonkey, WebKit/JavaScriptCore).
 *
 *   npx tsx scripts/frikik-cross-engine/run.mts               # karşılaştır (Playwright + 3 tarayıcı gerekli)
 *   npx tsx scripts/frikik-cross-engine/run.mts --write-golden # Node çıktısını altın dosyaya yaz (SIM_VERSION değişince)
 *   FRIKIK_PW_DIR=/yol/pw  …                                    # playwright paketi projede değilse (node_modules/playwright)
 *
 * Çıktı: her motor için bit düzeyinde eşit koşu sayısı, karar düzeyinde (vuruş türü/puan/seviye) eşit koşu sayısı,
 * ilk fark (koşu, vuruş, alan, büyüklük). Karar farkı varsa çıkış kodu 1.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { buildCases } from './cases';
import { runCases, type RunTrace } from './trace';

const ROOT = process.cwd();
const GOLDEN = path.join(ROOT, 'src/lib/frikik/__fixtures__/crossEngine.golden.json');
const OUT_DIR = process.env.FRIKIK_ENGINES_OUT ?? path.join(ROOT, '.cross-engine');

type Diff = { run: string; shot: number | null; field: string; a: unknown; b: unknown; delta: number | null };

function firstDiff(a: unknown, b: unknown, pathStr: string, out: Diff[], run: string, shot: number | null): void {
  if (out.length >= 5) return;
  if (typeof a === 'number' && typeof b === 'number') {
    if (!Object.is(a, b)) out.push({ run, shot, field: pathStr, a, b, delta: Math.abs(a - b) });
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return void out.push({ run, shot, field: `${pathStr}.length`, a: a.length, b: b.length, delta: null });
    a.forEach((v, i) => firstDiff(v, b[i], `${pathStr}[${i}]`, out, run, pathStr === 'shots' ? i : shot));
    return;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of Object.keys(a as object)) firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], pathStr ? `${pathStr}.${k}` : k, out, run, shot);
    return;
  }
  if (a !== b) out.push({ run, shot, field: pathStr, a, b, delta: null });
}

const decisionView = (r: RunTrace) => ({ level: r.level, cleared: r.cleared, lives: r.lives, total: r.total, shots: r.shots.map((s) => [s.level, s.kind, s.points, s.viaPost, s.corner]) });

async function main() {
  const cases = buildCases();
  const reference = runCases(cases);
  const shotCount = reference.runs.reduce((n, r) => n + r.shots.length, 0);
  const kinds = new Map<string, number>();
  for (const r of reference.runs) for (const s of r.shots) kinds.set(s.kind, (kinds.get(s.kind) ?? 0) + 1);
  const maxLevel = Math.max(...reference.runs.map((r) => r.level));
  console.log(`Koşu: ${cases.length}, vuruş: ${shotCount}, en yüksek seviye: ${maxLevel}, sonuç dağılımı: ${[...kinds].map(([k, n]) => `${k}=${n}`).join(' ')}`);

  if (process.argv.includes('--write-golden')) {
    writeFileSync(GOLDEN, JSON.stringify({ simVersion: reference.simVersion, cases, runs: reference.runs }));
    console.log(`Altın dosya yazıldı: ${path.relative(ROOT, GOLDEN)}`);
  }

  const bundle = await build({
    entryPoints: [path.join(ROOT, 'scripts/frikik-cross-engine/trace.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__frikikSim',
    target: 'es2019',
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    logLevel: 'silent',
  });
  const js = bundle.outputFiles[0]!.text;

  const require = createRequire(import.meta.url);
  const pwPath = process.env.FRIKIK_PW_DIR ? path.join(process.env.FRIKIK_PW_DIR, 'node_modules', 'playwright') : 'playwright';
  // Playwright isteğe bağlı bağımlılık (tip paketi projede olmayabilir): kullanılan küçük yüzey yerel tiplenir.
  type Page = { setContent: (html: string) => Promise<void>; addScriptTag: (o: { content: string }) => Promise<unknown>; evaluate: <R>(fn: (arg: unknown) => R, arg?: unknown) => Promise<R> };
  type Browser = { newPage: () => Promise<Page>; version: () => string; close: () => Promise<void> };
  type Pw = Record<'chromium' | 'firefox' | 'webkit', { launch: () => Promise<Browser> }>;
  let pw: Pw;
  try {
    pw = require(pwPath) as Pw;
  } catch {
    console.error('playwright bulunamadı: `npm i -D playwright && npx playwright install chromium firefox webkit` ya da FRIKIK_PW_DIR ver.');
    process.exit(2);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const rows: string[] = [];
  let decisionMismatch = false;
  for (const name of ['chromium', 'firefox', 'webkit'] as const) {
    const browser = await pw[name].launch();
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: js });
    const ua = await page.evaluate(() => navigator.userAgent);
    const out = await page.evaluate((cs: unknown) => JSON.stringify((globalThis as unknown as { __frikikSim: { runCases: (c: unknown) => unknown } }).__frikikSim.runCases(cs)), cases);
    await browser.close();
    const result = JSON.parse(out) as typeof reference;
    writeFileSync(path.join(OUT_DIR, `${name}.json`), out);
    let bitEqual = 0;
    let decisionEqual = 0;
    const diffs: Diff[] = [];
    reference.runs.forEach((ref, i) => {
      const got = result.runs[i]!;
      if (JSON.stringify(ref) === JSON.stringify(got)) bitEqual++;
      else firstDiff(ref, got, '', diffs, ref.id, null);
      if (JSON.stringify(decisionView(ref)) === JSON.stringify(decisionView(got))) decisionEqual++;
      else decisionMismatch = true;
    });
    const d = diffs[0];
    rows.push(`| ${name} | ${browser.version()} | ${bitEqual}/${cases.length} | ${decisionEqual}/${cases.length} | ${d ? `${d.run} vuruş ${d.shot ?? '-'} ${d.field}: ${String(d.a)} ↔ ${String(d.b)}${d.delta != null ? ` (Δ ${d.delta.toExponential(2)})` : ''}` : '—'} |`);
    console.log(`${name}: ${ua}`);
  }
  writeFileSync(path.join(OUT_DIR, 'node.json'), JSON.stringify(reference));
  console.log('\n| Motor | Sürüm | Bit düzeyinde eşit koşu | Karar düzeyinde eşit koşu | İlk fark |\n| --- | --- | --- | --- | --- |');
  for (const r of rows) console.log(r);
  if (decisionMismatch) {
    console.error('\nKARAR FARKI VAR: tarayıcı ve sunucu aynı koşuyu farklı skora çeviriyor.');
    process.exit(1);
  }
  console.log('\nSonuç: her motorda sunucuyla aynı karar ve skor.');
}

void main();
