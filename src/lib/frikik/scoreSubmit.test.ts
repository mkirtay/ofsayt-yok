import { describe, expect, it } from 'vitest';
import { finishedRun, findShot } from '@/test/frikik/runFixture';
import { dailySeed, parseDayKey } from './daily';
import { parseScoreSubmission, verifyRun } from './scoreSubmit';
import { SIM_VERSION, scoreLevelRun } from './sim';

const DAY = '2026-10-08';
const NOW = Date.UTC(2026, 9, 8, 9, 0, 0); // TR 12:00
const seed = dailySeed(parseDayKey(DAY)!);
const shots = finishedRun(seed);
const body = { day: DAY, seed, simVersion: SIM_VERSION, shots };

describe('skor gönderimi doğrulaması', () => {
  it('sunucu skoru kendisi hesaplar: gövdedeki skor/seviye alanları yok sayılır, sonuç yeniden oynatmadan gelir', () => {
    const expected = scoreLevelRun(seed, shots);
    const sub = parseScoreSubmission({ ...body, score: 999_999, level: 50, cleared: 49 });
    expect(sub).not.toBeNull();
    const v = verifyRun(sub!, NOW);
    expect(v).toEqual({ ok: true, day: DAY, seed, level: expected.level, cleared: expected.cleared, score: expected.total, shots: shots.length });
    expect(expected.level).toBe(2);
    expect(expected.total).toBeGreaterThan(0);
    expect(expected.total).toBeLessThan(999_999);
  });

  it('manipüle edilmiş vuruş girdisi: tam sayı / aralık dışı değer ya da fazla vuruş reddedilir', () => {
    expect(parseScoreSubmission({ ...body, shots: [{ ...shots[0], ms: 1.5 }, ...shots.slice(1)] })).toBeNull();
    expect(parseScoreSubmission({ ...body, shots: [{ ...shots[0], pts: [[99_999, 0]] }, ...shots.slice(1)] })).toBeNull();
    expect(parseScoreSubmission({ ...body, shots: [] })).toBeNull();
    expect(parseScoreSubmission({ ...body, seed: -1 })).toBeNull();
    expect(parseScoreSubmission({ ...body, simVersion: '2' })).toBeNull();
    // Canlar bittikten sonra eklenmiş fazladan vuruş: şüpheli → reddet
    const extra = parseScoreSubmission({ ...body, shots: [...shots, findShot(seed, 1, true)] })!;
    expect(verifyRun(extra, NOW)).toEqual({ ok: false, code: 'BAD_SHOTS' });
  });

  it('sürüm uyuşmazlığı reddedilir ve nedeni taşır', () => {
    const v = verifyRun({ ...body, simVersion: SIM_VERSION + 1 }, NOW);
    expect(v).toEqual({ ok: false, code: 'SIM_VERSION', detail: `client=${SIM_VERSION + 1} server=${SIM_VERSION}` });
  });

  it('yanlış tohum, kapalı gün, bozuk gün, bitmemiş koşu', () => {
    expect(verifyRun({ ...body, seed: seed ^ 1 }, NOW)).toEqual({ ok: false, code: 'BAD_SEED' });
    expect(verifyRun(body, NOW + 2 * 86_400_000)).toEqual({ ok: false, code: 'DAY_CLOSED' });
    expect(verifyRun({ ...body, day: '2026-02-30' }, NOW)).toEqual({ ok: false, code: 'BAD_DAY' });
    expect(verifyRun({ ...body, shots: shots.slice(0, 2) }, NOW)).toEqual({ ok: false, code: 'RUN_NOT_FINISHED' });
    // Gece yarısından 5 dk sonra dünün koşusu kabul (tolerans)
    const afterMidnight = Date.UTC(2026, 9, 8, 21, 5, 0); // TR 2026-10-09 00:05
    expect(verifyRun(body, afterMidnight).ok).toBe(true);
  });
});
