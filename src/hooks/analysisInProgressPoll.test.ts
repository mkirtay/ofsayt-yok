import { describe, expect, it } from 'vitest';
import { pollUntilReady } from './analysisInProgressPoll';

const noSleep = async () => {};

describe('409 "üretiliyor" yoklaması', () => {
  it('analiz hazır olunca döner (birkaç denemede)', async () => {
    let n = 0;
    const r = await pollUntilReady(async () => (++n >= 3 ? { id: 'a' } : null), { sleep: noSleep });
    expect(r).toEqual({ status: 'ready', value: { id: 'a' } });
    expect(n).toBe(3);
  });

  it('geçici ağ hatası yoklamayı durdurmaz', async () => {
    let n = 0;
    const r = await pollUntilReady(async () => {
      n++;
      if (n === 1) throw new Error('ağ');
      return { id: 'a' };
    }, { sleep: noSleep });
    expect(r.status).toBe('ready');
  });

  it('süre dolunca timeout; iptal edilince cancelled', async () => {
    expect(await pollUntilReady(async () => null, { sleep: noSleep, maxTries: 3 })).toEqual({ status: 'timeout' });
    let cancel = false;
    const r = await pollUntilReady(async () => {
      cancel = true;
      return null;
    }, { sleep: noSleep, isCancelled: () => cancel });
    expect(r).toEqual({ status: 'cancelled' });
  });

  it('varsayılan aralık birkaç saniye, üst sınır ~2 dk', async () => {
    const waits: number[] = [];
    await pollUntilReady(async () => null, { sleep: async (ms) => void waits.push(ms), maxTries: 2 });
    expect(waits).toEqual([4000, 4000]);
  });
});
