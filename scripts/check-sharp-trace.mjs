/**
 * Build sonrası denetim (`postbuild`): sharp'ın platform `.node` bağlamasını trace'ine alan her fonksiyonda, bağlamanın
 * dinamik bağlandığı libvips-cpp paylaşımlı kütüphanesi de trace'te olmalı. Yoksa fonksiyon Vercel'de ilk sharp
 * çağrısında "libvips-cpp.so…: cannot open shared object file" ile 500 verir (sharp 0.35 + @vercel/nft, 2026-10).
 * win32 bağlaması libvips'i kendi paketinde taşır, wasm32 paylaşımlı kütüphane kullanmaz; ikisi de denetlenmez.
 *
 *   node scripts/check-sharp-trace.mjs [distDir]   (varsayılan NEXT_DIST_DIR || .next)
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE_BINDING = /node_modules\/@img\/sharp-(?:linux|linuxmusl|darwin)-[^/]+\/.*\.node$/;
const LIBVIPS = /node_modules\/@img\/sharp-libvips-[^/]+\/lib\/libvips-cpp\.[^/]+$/;

/**
 * @param {string[]} files bir `.nft.json` dosyasının `files` listesi
 * @returns {boolean} false: sharp bağlaması var ama libvips yok
 */
export function sharpTraceComplete(files) {
  if (!files.some((f) => NATIVE_BINDING.test(f))) return true;
  return files.some((f) => LIBVIPS.test(f));
}

/** @returns {string[]} eksik trace'li `.nft.json` yolları (distDir'e göre) */
export function findIncompleteSharpTraces(distDir) {
  const serverDir = path.join(distDir, 'server');
  const bad = [];
  for (const rel of readdirSync(serverDir, { recursive: true })) {
    if (!String(rel).endsWith('.nft.json')) continue;
    const { files } = JSON.parse(readFileSync(path.join(serverDir, String(rel)), 'utf8'));
    if (!sharpTraceComplete(files)) bad.push(path.join('server', String(rel)));
  }
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = process.argv[2] || process.env.NEXT_DIST_DIR || '.next';
  const bad = findIncompleteSharpTraces(distDir);
  if (bad.length) {
    console.error(
      `[check-sharp-trace] sharp bağlaması var, libvips-cpp yok (next.config.ts outputFileTracingIncludes):\n  ${bad.join('\n  ')}`,
    );
    process.exit(1);
  }
  console.log('[check-sharp-trace] tamam');
}
