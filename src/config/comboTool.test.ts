import { describe, expect, it } from 'vitest';
import { parseComboFlag } from './comboTool';

describe('COMBO_TOOL_ENABLED', () => {
  it('varsayılan kapalı; yalnız 1/true/on açar', () => {
    for (const v of [undefined, null, '', '0', 'false', 'off', 'public', 'yes']) expect(parseComboFlag(v)).toBe(false);
    for (const v of ['1', 'true', 'ON', ' on ']) expect(parseComboFlag(v)).toBe(true);
  });
});
