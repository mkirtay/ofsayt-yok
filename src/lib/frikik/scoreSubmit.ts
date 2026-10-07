/**
 * Skor gönderimi doğrulaması (saf, DB yok): istemci SKOR GÖNDERMEZ; gün anahtarı, tohum, vuruş girdileri ve sim sürümü
 * gönderir. Sunucu günü/tohumu kendi hesaplar, koşuyu sim.ts ile yeniden oynatır ve puanı kendisi bulur. Uyumsuz sürüm
 * reddedilir (istemci eski paketle oynamış olabilir: aynı girdi farklı sonuç verirdi).
 */
import { dailySeed, isAcceptedDay, parseDayKey } from './daily';
import { MAX_LEVEL_SHOTS, SIM_VERSION, parseShotInput, scoreLevelRun, type ShotInput } from './sim';

export type ScoreSubmission = { day: string; seed: number; simVersion: number; shots: ShotInput[] };

export type SubmitReject = 'BAD_BODY' | 'BAD_DAY' | 'DAY_CLOSED' | 'BAD_SEED' | 'SIM_VERSION' | 'BAD_SHOTS' | 'RUN_NOT_FINISHED';

export type VerifiedRun = { ok: true; day: string; seed: number; level: number; cleared: number; score: number; shots: number };
export type VerifyResult = VerifiedRun | { ok: false; code: SubmitReject; detail?: string };

/** Gövde ayrıştırma: alan tipleri ve sınırlar (vuruş sayısı tavanı sim ile aynı). */
export function parseScoreSubmission(raw: unknown): ScoreSubmission | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.day !== 'string' || typeof o.seed !== 'number' || !Number.isInteger(o.seed) || o.seed < 0 || o.seed > 0xffffffff) return null;
  if (typeof o.simVersion !== 'number' || !Number.isInteger(o.simVersion)) return null;
  if (!Array.isArray(o.shots) || o.shots.length === 0 || o.shots.length > MAX_LEVEL_SHOTS) return null;
  const shots: ShotInput[] = [];
  for (const s of o.shots as unknown[]) {
    const p = parseShotInput(s);
    if (!p) return null;
    shots.push(p);
  }
  return { day: o.day, seed: o.seed, simVersion: o.simVersion, shots };
}

/** Gün + tohum + sürüm denetimi ve yeniden oynatma. Koşu bitmemişse (can kaldıysa) reddedilir: günde tek, bitmiş koşu. */
export function verifyRun(sub: ScoreSubmission, nowMs: number): VerifyResult {
  const day = parseDayKey(sub.day);
  if (day == null) return { ok: false, code: 'BAD_DAY' };
  if (!isAcceptedDay(day, nowMs)) return { ok: false, code: 'DAY_CLOSED' };
  if (sub.simVersion !== SIM_VERSION) return { ok: false, code: 'SIM_VERSION', detail: `client=${sub.simVersion} server=${SIM_VERSION}` };
  const seed = dailySeed(day);
  if (sub.seed !== seed) return { ok: false, code: 'BAD_SEED' };
  const run = scoreLevelRun(seed, sub.shots);
  if (run.lives !== 0) return { ok: false, code: 'RUN_NOT_FINISHED' };
  // Can bittikten sonra gelen fazla girdi sayılmaz (scoreLevelRun durur); fazlası gönderilmişse şüpheli → reddet.
  if (run.shots.length !== sub.shots.length) return { ok: false, code: 'BAD_SHOTS' };
  return { ok: true, day: sub.day, seed, level: run.level, cleared: run.cleared, score: run.total, shots: run.shots.length };
}
