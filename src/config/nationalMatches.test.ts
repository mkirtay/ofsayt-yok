import { describe, expect, it } from 'vitest';
import { parseNationalFlag } from './nationalMatches';

describe('NATIONAL_MATCHES_ENABLED', () => {
  it('varsayılan kapalı; yalnız 1/true/on açar', () => {
    for (const v of [undefined, null, '', '0', 'false', 'off', 'public', 'yes']) expect(parseNationalFlag(v)).toBe(false);
    for (const v of ['1', 'true', 'TRUE', ' on ']) expect(parseNationalFlag(v)).toBe(true);
  });
});
