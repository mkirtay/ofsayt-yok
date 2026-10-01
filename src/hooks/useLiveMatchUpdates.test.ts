import { describe, expect, it } from 'vitest';
import { LIVE_MAX_BACKOFF_MS, LIVE_POLL_MS, liveRetryDelayMs } from './useLiveMatchUpdates';

describe('liveRetryDelayMs', () => {
  it('hata yokken 30 sn; ardışık hatada üstel, en çok 5 dk', () => {
    expect(liveRetryDelayMs(0)).toBe(LIVE_POLL_MS);
    expect(liveRetryDelayMs(1)).toBe(60_000);
    expect(liveRetryDelayMs(2)).toBe(120_000);
    expect(liveRetryDelayMs(3)).toBe(240_000);
    expect(liveRetryDelayMs(4)).toBe(LIVE_MAX_BACKOFF_MS);
    expect(liveRetryDelayMs(10)).toBe(LIVE_MAX_BACKOFF_MS);
  });
});
