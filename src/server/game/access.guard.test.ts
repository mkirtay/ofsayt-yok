/**
 * Koruma: tahmin oyununun HER API ucu `withGameGate`'ten, HER sayfası `gamePageGate`'ten (admin sayfası `gameMode`) geçer.
 * Yeni bir uç / sayfa kapıyı unutursa GAME_ENABLED kapalıyken prod'da görünür → bu test kırılır.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}
const ROOT = process.cwd();
const rel = (p: string) => path.relative(ROOT, p);

describe('tahmin oyunu kapısı her yerde', () => {
  it('API uçları withGameGate ile dışa aktarılıyor', () => {
    const files = [...walk(path.join(ROOT, 'src/pages/api/game')), ...walk(path.join(ROOT, 'src/pages/api/admin/game'))];
    expect(files.length).toBeGreaterThan(10);
    const bad = files.filter((f) => !/export default withGameGate\(handler/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(bad).toEqual([]);
  });

  it('sayfalar gamePageGate (admin: gameMode) kullanıyor', () => {
    const pages = walk(path.join(ROOT, 'src/pages/tahmin'));
    expect(pages.length).toBeGreaterThanOrEqual(4);
    const bad = pages.filter((f) => !/await gamePageGate\(req, res\)/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(bad).toEqual([]);
    expect(readFileSync(path.join(ROOT, 'src/pages/admin/tahmin.tsx'), 'utf8')).toMatch(/gameMode\(\) === 'off'\) return \{ notFound: true \}/);
  });

  it('mobil menü bağlantısı yalnız GAME_PUBLIC_CLIENT ile', () => {
    const header = readFileSync(path.join(ROOT, 'src/components/Header/index.tsx'), 'utf8');
    expect(header).toMatch(/\{GAME_PUBLIC_CLIENT \? \(\s*<Link href=\{GAME_BRAND\.basePath\}/);
    expect(header.match(/GAME_BRAND\.basePath/g)).toHaveLength(1);
  });
});
