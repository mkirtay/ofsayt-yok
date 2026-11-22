/** Onaysız ilk çizimde (SSR / ilk istemci çizimi) Meta Pixel ne betik ne yer tutucu üretir. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/router', () => ({ useRouter: () => ({ events: { on: vi.fn(), off: vi.fn() } }) }));
vi.mock('next/script', () => ({ default: (p: { src: string }) => <script data-mock-src={p.src} /> }));

import MetaPixel from './MetaPixel';

describe('MetaPixel', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('Pixel tanımlı ama onay okunmadan/verilmeden hiçbir şey çizmez, fbq kurmaz', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '2078066272887823');
    expect(renderToStaticMarkup(<MetaPixel />)).toBe('');
    expect((globalThis as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it('Pixel tanımsızsa hiçbir şey çizmez', () => {
    vi.stubEnv('NEXT_PUBLIC_META_PIXEL_ID', '');
    expect(renderToStaticMarkup(<MetaPixel />)).toBe('');
  });
});
