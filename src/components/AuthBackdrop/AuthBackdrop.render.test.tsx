import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthBackdrop from './index';

describe('AuthBackdrop', () => {
  it('sunucu HTML\'i: yalnız boş, aria-hidden kap (oyun alanı boşta, istemcide yüklenir → ilk yük ve kayma yok)', () => {
    const html = renderToStaticMarkup(<AuthBackdrop />);
    expect(html).toMatch(/^<div class="[^"]*" aria-hidden="true"><\/div>$/);
  });
});
