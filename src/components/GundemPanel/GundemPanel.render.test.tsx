import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GundemPanel from './index';

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

function render(props: Partial<React.ComponentProps<typeof GundemPanel>> = {}) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GundemPanel scope="all" onOpenPost={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('<GundemPanel />', () => {
  it('varsayılan: composer (oturumsuz → giriş bağlantısı) + akış yüklenirken "Yükleniyor"', () => {
    const html = render();
    expect(html).toContain('href="/auth/signin"');
    expect(html).toContain('Yükleniyor');
    expect(html).toContain('aria-busy="true"');
  });

  it("composer='none' composer'ı hiç basmaz", () => {
    expect(render({ composer: 'none' })).not.toContain('/auth/signin');
  });

  it("composer='post-inline' oturumsuzken tek satır giriş bağlantısı basar", () => {
    expect(render({ composer: 'post-inline' })).toContain('loginInline');
  });

  it('enabled=false: akış çekilmez, "boş"/hata değil yükleniyor durumunda kalır', () => {
    const html = render({ enabled: false });
    expect(html).toContain('Yükleniyor');
    expect(html).not.toContain('Henüz gönderi yok');
  });

  it('maç forumu: özel yer tutucu composer\'a gider (oturumsuz → giriş istemi), boş metin prop\'u kabul edilir', () => {
    const html = render({ scope: 'match', matchId: '19134567', composer: 'post-inline', emptyText: 'Maç boş' });
    expect(html).toContain('href="/auth/signin"');
    expect(html).toContain('Yükleniyor');
  });
});
