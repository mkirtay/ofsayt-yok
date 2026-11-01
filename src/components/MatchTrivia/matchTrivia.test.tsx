/** Girişsiz İlginç sekmesi: önizleme yalnız gri çubuk; örnek metin SSR HTML'de yok, kilit/üye ol çağrısı erişilebilir. */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated' }) }));

import MatchTrivia from '@/components/MatchTrivia';

const match = { home: { name: 'Galatasaray' }, away: { name: 'Fenerbahçe' } } as never;

describe('MatchTrivia (girişsiz)', () => {
  const html = renderToStaticMarkup(<MatchTrivia matchId="123" match={match} />);

  it('önizleme metni ve takım adları HTML’e basılmıyor', () => {
    for (const s of ['karşılaşmasının', 'beraberlik', 'deplasmanlarında', 'rekabet onlarca', 'Galatasaray', 'Fenerbahçe']) {
      expect(html).not.toContain(s);
    }
    expect(html).not.toContain('trivia.unknowns');
    expect(html).not.toContain('trivia.rivalry');
  });

  it('önizleme bloğu aria-hidden + data-nosnippet, içinde metin yok', () => {
    const m = /<div[^>]*aria-hidden="true"[^>]*data-nosnippet=""[^>]*>([\s\S]*?)<\/div><div class="[^"]*lockedOverlay/.exec(html);
    expect(m).not.toBeNull();
    expect(m![1]!.replace(/<[^>]+>/g, '').trim()).toBe('');
  });

  it('kilit başlığı ve üye ol bağlantısı erişilebilir kalıyor', () => {
    const overlay = html.slice(html.indexOf('lockedOverlay'));
    expect(overlay).not.toContain('aria-hidden');
    expect(overlay).toContain('trivia.lockedTitle');
    expect(overlay).toContain('href="/auth/signin"');
    expect(overlay).toContain('trivia.signInCta');
  });
});
