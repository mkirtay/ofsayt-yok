import { describe, expect, it } from 'vitest';
import { isCronAuthorization } from './cronSecret';
import { constantTimeEqual } from './constantTimeEqual';

describe('cron sırrı — sabit zamanlı karşılaştırma', () => {
  it('Node: yalnız tam "Bearer <sır>" kabul; sır tanımsızsa hep false', () => {
    expect(isCronAuthorization('Bearer s3cret', 's3cret')).toBe(true);
    expect(isCronAuthorization('Bearer s3cre', 's3cret')).toBe(false);
    expect(isCronAuthorization('Bearer s3cretX', 's3cret')).toBe(false);
    expect(isCronAuthorization('s3cret', 's3cret')).toBe(false);
    expect(isCronAuthorization(undefined, 's3cret')).toBe(false);
    expect(isCronAuthorization('Bearer ', '')).toBe(false);
    expect(isCronAuthorization('Bearer undefined', undefined)).toBe(false);
  });

  it('Edge: constantTimeEqual', () => {
    expect(constantTimeEqual('Bearer abc', 'Bearer abc')).toBe(true);
    expect(constantTimeEqual('Bearer abd', 'Bearer abc')).toBe(false);
    expect(constantTimeEqual('Bearer ab', 'Bearer abc')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
    expect(constantTimeEqual('a\u0000', 'a')).toBe(false);
  });
});
