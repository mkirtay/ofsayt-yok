import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LeaderboardView } from '@/lib/game/types';

vi.mock('next-auth/react', () => ({ useSession: () => ({ status: 'unauthenticated', data: null }) }));

const board: LeaderboardView = {
  scope: 'week',
  key: '2026-W43',
  participants: 2,
  matchCount: 10,
  settledCount: 0,
  firstKickoffAt: '2026-10-20T16:45:00.000Z',
  entries: [
    { rank: 1, nickname: 'scor3', image: 'https://www.getscor3.com/brand/logo.png', points: 0, exact: 0, direction: 0, picks: 10 },
    { rank: 2, nickname: 'golcu_ali', image: null, points: 0, exact: 0, direction: 0, picks: 7 },
  ],
};

describe('<Leaderboard /> oyuncu görseli', () => {
  it('profil fotoğrafı varsa görsel (resmi hesap logosu dahil), yoksa baş harf; tahmin sayısı ve katılımcı sayacı', async () => {
    const { default: Leaderboard } = await import('./Leaderboard');
    const html = renderToStaticMarkup(<Leaderboard weekKey="2026-W43" season="2026-27" initial={board} initialScope="week" />);
    expect(html).toContain('logo.png');
    expect(html).toMatch(/>G<\/span>/); // golcu_ali → baş harf
    expect(html).toContain('10/10');
    expect(html).toContain('7/10');
    expect(html).not.toContain('🥇'); // sonuç öncesi podyum yok
  });
});
