import { describe, it, expect } from 'vitest';
import { findActivePeriod, deriveLiveMinute, formatLiveMinuteLabel } from './minuteDerivation';
import periodsFinished from './__fixtures__/periodsFinished.json';
import periodsLive from './__fixtures__/periodsLive.json';
import type { SportmonksPeriod } from './types';

describe('findActivePeriod / deriveLiveMinute', () => {
  it('ticking:false olan bitmiş maçta (Pass 2, fixture 19874792) aktif period bulunmaz', () => {
    expect(findActivePeriod(periodsFinished as SportmonksPeriod[])).toBeNull();
    expect(deriveLiveMinute(periodsFinished as SportmonksPeriod[])).toBeNull();
    expect(formatLiveMinuteLabel(periodsFinished as SportmonksPeriod[])).toBeNull();
  });

  it('ticking:true olan canlı periyotta (Pass 3 Soru 1, üçüncü ölçüm: 11:41) doğru dakika döner', () => {
    const active = findActivePeriod(periodsLive as SportmonksPeriod[]);
    expect(active).not.toBeNull();
    expect(active?.minutes).toBe(11);
    expect(active?.seconds).toBe(41);

    expect(deriveLiveMinute(periodsLive as SportmonksPeriod[])).toEqual({
      minutes: 11,
      seconds: 41,
      hasTimer: true,
    });
    expect(formatLiveMinuteLabel(periodsLive as SportmonksPeriod[])).toBe("11'");
  });

  it('boş/null dizide null döner', () => {
    expect(findActivePeriod([])).toBeNull();
    expect(findActivePeriod(null)).toBeNull();
    expect(deriveLiveMinute(undefined)).toBeNull();
  });

  it('700 saniyelik gerçek fark, raporun kendi hesabıyla tutarlı (Pass 3: started=1789660953, ölçüm anı=1789661653)', () => {
    // Bu, minuteDerivation.ts'in DAYANDIĞI kanıtın kendisi — periods[0].started
    // ile ölçüm anındaki timestamp farkı 700 saniye (=11dk40sn), API'nin
    // döndürdüğü "11:41" ile (yuvarlama farkı hariç) örtüşüyor.
    const started = (periodsLive as SportmonksPeriod[])[0]!.started!;
    const measuredAt = 1789661653;
    const elapsedSeconds = measuredAt - started;
    expect(elapsedSeconds).toBe(700);
    expect(Math.floor(elapsedSeconds / 60)).toBe(11);
  });
});
