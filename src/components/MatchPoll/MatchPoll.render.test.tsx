import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const session = vi.hoisted(() => ({ data: { user: { id: 'u1' } } as unknown }));
vi.mock('next-auth/react', () => ({ useSession: () => session }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import MatchPoll from './index';

const buttons = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe('MatchPoll kilidi', () => {
  it('açık: girişli kullanıcıda butonlar aktif, normal alt başlık', () => {
    const html = renderToStaticMarkup(<MatchPoll matchId="1" />);
    expect(buttons(html)).toHaveLength(3);
    expect(buttons(html).some((b) => b.includes('disabled'))).toBe(false);
    expect(html).toContain('poll.subtitle<');
  });

  it('kilitli: butonlar devre dışı, kilit alt başlığı, giriş çağrısı yok', () => {
    session.data = null;
    const html = renderToStaticMarkup(<MatchPoll matchId="1" locked />);
    expect(buttons(html).every((b) => b.includes('disabled'))).toBe(true);
    expect(html).toContain('poll.subtitleLocked');
    expect(html).not.toContain('poll.loginCta');
    session.data = { user: { id: 'u1' } };
  });
});
