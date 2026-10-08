import { describe, expect, it } from 'vitest';
import { sharpTraceComplete } from '../../scripts/check-sharp-trace.mjs';

const NM = '../../../../../node_modules';

describe('check-sharp-trace (postbuild)', () => {
  it('2026-10 canlı hatası: linux-x64 bağlaması trace\'te, libvips-cpp.so yok → eksik', () => {
    const files = [
      `${NM}/sharp/dist/index.cjs`,
      `${NM}/@img/sharp-linux-x64/index.cjs`,
      `${NM}/@img/sharp-linux-x64/lib/sharp-linux-x64-0.35.5.node`,
      `${NM}/@img/sharp-libvips-linux-x64/lib/index.js`,
      `${NM}/@img/sharp-libvips-linux-x64/package.json`,
    ];
    expect(sharpTraceComplete(files)).toBe(false);
    expect(sharpTraceComplete([...files, `${NM}/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so.8.18.7`])).toBe(true);
  });

  it('darwin (.dylib) aynı kural; sharp kullanmayan ya da yalnız wasm32 trace\'i denetlenmez', () => {
    expect(sharpTraceComplete([`${NM}/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64-0.35.5.node`])).toBe(false);
    expect(
      sharpTraceComplete([
        `${NM}/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64-0.35.5.node`,
        `${NM}/@img/sharp-libvips-darwin-arm64/lib/libvips-cpp.8.18.7.dylib`,
      ]),
    ).toBe(true);
    expect(sharpTraceComplete([`${NM}/react/index.js`])).toBe(true);
    expect(sharpTraceComplete([`${NM}/@img/sharp-wasm32/lib/sharp-wasm32-0.35.5.node.wasm`])).toBe(true);
  });
});
