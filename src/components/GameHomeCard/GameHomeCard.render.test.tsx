import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }));

describe('<GameHomeCard />', () => {
  it('sunucu HTML: sabit kabuk (10 maç · Ücretsiz oyna), oyun sayfasına bağlantı; marka adı yer tutucudan', async () => {
    const { default: GameHomeCard } = await import('./index');
    const html = renderToStaticMarkup(<GameHomeCard />);
    expect(html).toContain('href="/tahmin?oyun=haftalik&amp;src=home_card"');
    expect(html).toContain('10');
    expect(html).not.toContain('{{');
  });
});
