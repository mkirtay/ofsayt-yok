/**
 * Gerçek cihaz testi: oyunda `?debug=1` ile açılan "Koşuyu kopyala" düğmesinin verdiği JSON'u (cihazın sim çıktısı)
 * Node'da yeniden oynatır ve vuruş vuruş karşılaştırır.
 *
 *   npx tsx scripts/frikik-cross-engine/verify.mts kosu.json
 *   pbpaste | npx tsx scripts/frikik-cross-engine/verify.mts -
 */
import { readFileSync } from 'node:fs';
import { SIM_VERSION, scoreLevelRun } from '@/lib/frikik/sim';
import type { ExportedRun } from '@/lib/frikik/runExport';

const src = process.argv[2];
if (!src) {
  console.error('kullanım: verify.mts <kosu.json | ->');
  process.exit(2);
}
const run = JSON.parse(readFileSync(src === '-' ? 0 : src, 'utf8')) as ExportedRun;
if (run.simVersion !== SIM_VERSION) {
  console.error(`SIM_VERSION farklı: cihaz ${run.simVersion}, sunucu ${SIM_VERSION} → karşılaştırma anlamsız`);
  process.exit(1);
}
const server = scoreLevelRun(run.seed, run.shots);
let bad = 0;
console.log(`cihaz: ${run.ua}\ngün ${run.day}, tohum ${run.seed}, vuruş ${run.shots.length}\n`);
console.log('| # | seviye | cihaz | sunucu | durum |\n| --- | --- | --- | --- | --- |');
run.results.forEach((r, i) => {
  const s = server.shots[i];
  const dev = `${r.kind} ${r.points}p${r.viaPost ? ' direk' : ''}${r.corner ? ' doksan' : ''}`;
  const srv = s ? `${s.result.kind} ${s.points}p${s.result.viaPost ? ' direk' : ''}${s.result.corner ? ' doksan' : ''}` : '—';
  const ok = !!s && s.level === r.level && s.result.kind === r.kind && s.points === r.points && s.result.viaPost === r.viaPost && s.result.corner === r.corner;
  if (!ok) bad++;
  console.log(`| ${i + 1} | ${r.level} | ${dev} | ${srv} | ${ok ? 'aynı' : 'FARK'} |`);
});
console.log(`\ncihaz: seviye ${run.level}, ${run.total} puan · sunucu: seviye ${server.level}, ${server.total} puan`);
if (bad || server.total !== run.total || server.level !== run.level) {
  console.error(`FARK: ${bad} vuruş`);
  process.exit(1);
}
console.log('Sonuç: cihaz ve sunucu aynı.');
