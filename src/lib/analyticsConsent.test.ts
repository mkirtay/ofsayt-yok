import { afterEach, describe, expect, it, vi } from 'vitest';
import { gaMeasurementId } from './analyticsConsent';

describe('gaMeasurementId', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('yalnız geçerli G- kimliği; yoksa GA ve onay bandı kapalı', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', '');
    expect(gaMeasurementId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'UA-123');
    expect(gaMeasurementId()).toBeNull();
    vi.stubEnv('NEXT_PUBLIC_GA_ID', ' G-AB12CD34EF ');
    expect(gaMeasurementId()).toBe('G-AB12CD34EF');
  });
});
