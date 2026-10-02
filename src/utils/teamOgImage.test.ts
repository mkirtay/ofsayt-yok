import { describe, expect, it } from 'vitest';
import { isAcceptedTeamOgVersion, teamOgImagePath, teamOgVersion } from './teamOgImage';

// 2026-10-02 22:30 UTC = 3 Ekim 01:30 TSİ
const NOW = Date.parse('2026-10-02T22:30:00Z');

describe('teamOgImage', () => {
  it('sürüm TSİ günü (YYYYMMDD); adres yalnız kimlik + gün', () => {
    expect(teamOgVersion(NOW)).toBe('20261003');
    expect(teamOgImagePath(34, NOW)).toBe('/api/og/team/34?v=20261003');
  });

  it('bugün ve dün kabul; daha eski / rastgele / yok reddedilir', () => {
    expect(isAcceptedTeamOgVersion('20261003', NOW)).toBe(true);
    expect(isAcceptedTeamOgVersion('20261002', NOW)).toBe(true);
    for (const v of ['20261001', 'x', '', undefined, ['20261003']]) expect(isAcceptedTeamOgVersion(v, NOW)).toBe(false);
  });
});
