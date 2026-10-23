import { describe, expect, it } from 'vitest';
import { isNudgeCoolingDown, isNudgeHiddenPath, NUDGE_COOLDOWN_MS } from './nudge';

describe('SignupNudge kuralları', () => {
  it('giriş/kayıt, admin ve yasal sayfalarda gizli; ana sayfa ve maçta açık', () => {
    for (const p of ['/auth/signup', '/admin', '/yasal/kvkk', '/pricing', '/hesap-silme/onay']) expect(isNudgeHiddenPath(p)).toBe(true);
    for (const p of ['/', '/matches/[slug]', '/frikik', '/gundem']) expect(isNudgeHiddenPath(p)).toBe(false);
  });
  it('kapatma 1 gün bekletir', () => {
    const now = 10 * NUDGE_COOLDOWN_MS;
    expect(isNudgeCoolingDown(String(now - 1000), now)).toBe(true);
    expect(isNudgeCoolingDown(String(now - NUDGE_COOLDOWN_MS - 1), now)).toBe(false);
    expect(isNudgeCoolingDown(null, now)).toBe(false);
    expect(isNudgeCoolingDown('x', now)).toBe(false);
  });
});
