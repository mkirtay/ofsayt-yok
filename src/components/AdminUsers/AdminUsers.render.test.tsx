import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminUsers from './index';

const render = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AdminUsers />
    </QueryClientProvider>,
  );

describe('AdminUsers', () => {
  it('ilk görünüm: arama formu, açıklama, tüm kullanıcılar bölümü; ayrıntı kartı yok', () => {
    const html = render();
    expect(html).toContain('Kullanıcılar');
    expect(html).toContain('aria-label="Kullanıcı ara"');
    expect(html).toContain('Tüm kullanıcılar');
    expect(html).not.toContain('Kullanıcı ayrıntısı');
  });

  it('premium sistemi kaldırıldı: açıklamada ve arayüzde premium yok; kredi ekle / çıkar kalır', () => {
    const html = render();
    expect(html).not.toMatch(/premium/i);
    expect(html).toContain('Kredi ekle / çıkar');
  });
});
