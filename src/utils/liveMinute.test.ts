import { describe, expect, it } from 'vitest';
import { liveMinuteLabel, liveMinuteValue } from './liveMinute';

describe('liveMinuteLabel', () => {
  it('kesmeli ve kesmesiz girdide tek kesme', () => {
    expect(liveMinuteLabel('51')).toBe("51'");
    expect(liveMinuteLabel("51'")).toBe("51'");
    expect(liveMinuteLabel(" 77' ")).toBe("77'");
    expect(liveMinuteLabel("90+3'")).toBe("90+3'");
    expect(liveMinuteLabel(45)).toBe("45'");
  });

  it('boş / yalnız kesme → boş', () => {
    expect(liveMinuteLabel('')).toBe('');
    expect(liveMinuteLabel("'")).toBe('');
    expect(liveMinuteLabel(undefined)).toBe('');
    expect(liveMinuteValue("63'")).toBe('63');
  });
});
