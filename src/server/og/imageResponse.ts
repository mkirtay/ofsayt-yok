/**
 * `next/og` Node çalışma ortamında çizim motorunu (`@vercel/og/index.node.js`) koşullu dinamik `import()` ile yüklüyor;
 * Vercel'in dosya izlemesi (nft) bunu takip edemediği için motor ve okuduğu dosyalar (resvg.wasm, yoga.wasm, yedek font)
 * fonksiyona girmiyor → yerelde (`next start`, node_modules yerinde) çalışır, üretimde her çizim hata verir.
 * Doğrudan statik import: modül ve `new URL('./…', import.meta.url)` ile okunan dosyalar izlenir.
 */
export { ImageResponse } from 'next/dist/compiled/@vercel/og/index.node.js';
