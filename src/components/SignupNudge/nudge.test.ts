import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isNudgeCoolingDown, isNudgeEngaged, isNudgeHiddenPath, NUDGE_COOLDOWN_MS } from './nudge';

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

describe('Üye ol kartı ↔ ilk ziyaret tanıtımı (bağlantı)', () => {
  const src = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
  it('tanıtım sürerken sayaç kurulmaz, kapanış olayı beklenir; açıkken alt yığın işaretlenir', () => {
    expect(src).toMatch(/if \(isIntroPending\(\)\) \{[\s\S]*?INTRO_DONE_EVENT[\s\S]*?return/);
    expect(src.indexOf('isIntroPending()')).toBeLessThan(src.indexOf('window.setTimeout('));
    // Süre dolunca da yalnız etkileşimle (kaydırma / 2. sayfa).
    expect(src).toMatch(/setTimeout\(\(\) => \{\s*if \(engaged\(\)\) setOpen\(true\);\s*else window.addEventListener\('scroll'/);
    // Alt yığın işareti ortak hook'ta (ödül kartı da kullanır).
    expect(src).toContain('useNudgeStack(ref, visible)');
    const hook = readFileSync(path.resolve(__dirname, 'useNudgeStack.ts'), 'utf8');
    expect(hook).toContain('root.setAttribute(NUDGE_OPEN_ATTR');
    expect(hook).toContain('BOTTOM_STACK_OFFSET_VAR');
  });
});

describe('isNudgeEngaged — davet yalnız etkileşimden sonra', () => {
  it('ilk ekranda, kaydırmadan: hayır', () => {
    expect(isNudgeEngaged({ scrollY: 0, viewportHeight: 812, pageViews: 1 })).toBe(false);
    expect(isNudgeEngaged({ scrollY: 500, viewportHeight: 812, pageViews: 1 })).toBe(false);
  });
  it('~1 ekran aşağı indi ya da ikinci sayfa: evet', () => {
    expect(isNudgeEngaged({ scrollY: 650, viewportHeight: 812, pageViews: 1 })).toBe(true);
    expect(isNudgeEngaged({ scrollY: 0, viewportHeight: 812, pageViews: 2 })).toBe(true);
  });
});
