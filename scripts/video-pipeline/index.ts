/**
 * Ofsayt Yok — Video Pipeline CLI
 *
 * Kullanım:
 *   npm run video -- --team "Türkiye" --topic "gruptan çıkabilir mi?"
 *   npm run video -- --team "Brezilya"   (topic opsiyonel)
 */
import fs from 'fs';
import path from 'path';
import { buildTeamBriefing } from './pipeline/contentBriefing';
import { generateScript } from './pipeline/scriptGenerator';
import { toSlug } from './config';

function parseArgs(): { team: string; topic: string } {
  const args = process.argv.slice(2);
  let team = '';
  let topic = '2026 Dünya Kupası analizi';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--team' && args[i + 1]) { team = args[++i]; continue; }
    if (args[i] === '--topic' && args[i + 1]) { topic = args[++i]; continue; }
  }

  if (!team) {
    console.error('Hata: --team parametresi zorunlu.\nÖrnek: npm run video -- --team "Türkiye"');
    process.exit(1);
  }

  return { team, topic };
}

function writeOutput(slug: string, briefingJson: string, script: string): string {
  const outDir = path.join(process.cwd(), 'output', slug);
  fs.mkdirSync(outDir, { recursive: true });

  const briefingPath = path.join(outDir, 'briefing.json');
  const scriptPath = path.join(outDir, 'script.md');

  fs.writeFileSync(briefingPath, briefingJson, 'utf-8');
  fs.writeFileSync(scriptPath, script, 'utf-8');

  return outDir;
}

async function main() {
  const { team, topic } = parseArgs();

  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Ofsayt Yok — Video Pipeline            ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log(`Takım   : ${team}`);
  console.log(`Konu    : ${topic}`);
  console.log(`─────────────────────────────────────────────\n`);

  // 1. Veri toplama
  const briefing = await buildTeamBriefing(team);
  const slug = toSlug(team);

  console.log(`\n[Pipeline] Briefing tamamlandı:`);
  console.log(`  Kaynaklar: Transfermarkt=${briefing.sources.transfermarkt} | FBref=${briefing.sources.fbref} | WorldFootball=${briefing.sources.worldfootball}`);
  console.log(`  İlginç gerçek sayısı: ${briefing.interestingFacts.length}`);

  // 2. Script üretimi
  const script = await generateScript(briefing, topic);

  // 3. Kaydet
  const outDir = writeOutput(slug, JSON.stringify(briefing, null, 2), script);

  console.log(`\n✓ Tamamlandı!`);
  console.log(`  Briefing : ${outDir}/briefing.json`);
  console.log(`  Script   : ${outDir}/script.md`);
  console.log(`\nSonraki adım: script.md'yi BigVu'ya aktar ve çekime başla.\n`);
}

main().catch((err) => {
  console.error('\nKritik hata:', err instanceof Error ? err.message : err);
  process.exit(1);
});
