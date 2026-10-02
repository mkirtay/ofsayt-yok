import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { getTeamCompetitions } from './liveScoreService';

const match = (id: number, competition: { id: number; name: string; logo?: string }, country?: { id: number; flag?: string }) =>
  ({ id, home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' }, competition, country }) as unknown as Match;

describe('getTeamCompetitions — bayrak yedeği', () => {
  it('Sportmonks ülke görseli varsa satıra taşınır; yoksa alan hiç yok (kırık eski proxy URL\'si üretilmez)', () => {
    const rows = getTeamCompetitions(
      [
        match(1, { id: 600, name: 'Süper Lig' }, { id: 404, flag: 'https://cdn.sportmonks.com/images/countries/png/short/tr.png' }),
        match(2, { id: 606, name: 'Türkiye Kupası' }, { id: 404 }),
      ],
      '1',
    );
    expect(rows[0]).toMatchObject({ id: 600, countryFlag: 'https://cdn.sportmonks.com/images/countries/png/short/tr.png' });
    expect(rows[1]).not.toHaveProperty('countryFlag');
  });
});
