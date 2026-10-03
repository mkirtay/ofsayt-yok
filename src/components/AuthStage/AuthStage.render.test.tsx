import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthStage, { webglAvailable } from './index';

describe('AuthStage', () => {
  it("sunucu HTML'i: yalnız boş, aria-hidden, sabit boyutlu kutu (sahne istemcide sonradan → ilk yük ve kayma yok)", () => {
    const html = renderToStaticMarkup(<AuthStage className="x" goalLabel="GOL!" />);
    expect(html).toMatch(/^<div class="[^"]* x" aria-hidden="true"><\/div>$/);
  });

  it('WebGL denetimi: yoksa / engelliyse false (sahne yüklenmez, gradyan kalır), hata fırlatmaz; varsa deneme bağlamı bırakılır', () => {
    try {
      vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
      expect(webglAvailable()).toBe(false);
      vi.stubGlobal('document', {
        createElement: () => ({
          getContext: () => {
            throw new Error('blocked');
          },
        }),
      });
      expect(webglAvailable()).toBe(false);
      const loseContext = vi.fn();
      vi.stubGlobal('document', {
        createElement: () => ({ getContext: () => ({ getExtension: () => ({ loseContext }) }) }),
      });
      expect(webglAvailable()).toBe(true);
      expect(loseContext).toHaveBeenCalledOnce(); // deneme bağlamı bırakılır
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('three.js yalnız dinamik import ile: bileşen ve sayfalar statik olarak three / stageScene içe aktarmaz', () => {
    const root = process.cwd();
    const read = (p: string) => readFileSync(join(root, p), 'utf8');
    const index = read('src/components/AuthStage/index.tsx');
    expect(index).not.toMatch(/from ['"]three/);
    expect(index).not.toMatch(/from ['"]\.\/stageScene/);
    expect(index).toMatch(/import\(['"]\.\/stageScene['"]\)/);
    for (const page of ['src/pages/auth/signin.tsx', 'src/pages/auth/signup.tsx']) {
      expect(read(page)).not.toMatch(/['"]three/);
    }
  });
});
