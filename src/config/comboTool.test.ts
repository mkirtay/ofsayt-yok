import { describe, expect, it } from 'vitest';
import { parseComboFlag } from './comboTool';

describe('COMBO_TOOL_ENABLED', () => {
  it('varsayılan kapalı; yalnız 1/true/on açar', () => {
    for (const v of [undefined, null, '', '0', 'false', 'off', 'public', 'yes']) expect(parseComboFlag(v)).toBe(false);
    for (const v of ['1', 'true', 'ON', ' on ']) expect(parseComboFlag(v)).toBe(true);
  });
});

import { canUseComboTool, parseComboAllowlist } from './comboTool';

describe('kombine kapısı', () => {
  const list = parseComboAllowlist('Tester@Example.com, u_42;  u_7');
  it('bayrak kapalıysa kimse göremez (ADMIN dahil)', () => {
    expect(canUseComboTool({ id: 'x', role: 'ADMIN' }, false, list)).toBe(false);
  });
  it('ADMIN, izin listesindeki kimlik / e-posta (büyük-küçük harf fark etmez) görür; diğerleri ve misafir görmez', () => {
    expect(canUseComboTool({ id: 'x', role: 'ADMIN' }, true, list)).toBe(true);
    expect(canUseComboTool({ id: 'U_42', role: 'USER' }, true, list)).toBe(true);
    expect(canUseComboTool({ id: 'z', role: 'USER', email: 'tester@example.com' }, true, list)).toBe(true);
    expect(canUseComboTool({ id: 'z', role: 'USER', email: 'other@example.com' }, true, list)).toBe(false);
    expect(canUseComboTool(null, true, list)).toBe(false);
    expect(canUseComboTool({ id: '', role: 'USER', email: '' }, true, new Set(['']))).toBe(false);
  });
});
