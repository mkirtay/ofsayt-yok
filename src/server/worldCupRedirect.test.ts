import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import nextConfig from '../../next.config';

// /world-cup kaldırıldı (Dünya Kupası Sportmonks planında yok): eski bağlantılar ana sayfaya kalıcı yönlenir.
describe('/world-cup yönlendirmesi', () => {
  it('sayfa yok, /world-cup ve alt yolları / adresine 308', async () => {
    expect(existsSync('src/pages/world-cup')).toBe(false);
    const redirects = (await nextConfig.redirects?.()) ?? [];
    for (const source of ['/world-cup', '/world-cup/:path*']) {
      expect(redirects).toContainEqual({ source, destination: '/', permanent: true });
    }
  });
});
