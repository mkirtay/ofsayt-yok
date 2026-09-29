/**
 * Bir maç listesi "aktif" mi — canlı maç var ya da bir maçın başlama saatine ±15 dk kaldı/geçti.
 * Tek yerde tanımlı: ana sayfa polling aralığı, `/api/matches/day` CDN süresi ve gündem bot'unun
 * `livescores/inplay`'e gidip gitmeyeceği bununla karar verir (Sportmonks tarafındaki karşılığı:
 * services/sportmonks/cachePolicy.ts `fixtureListFreshSeconds`).
 */
import type { Match } from '@/models/liveScore';

export const ACTIVE_WINDOW_MS = 15 * 60_000;
/** Başlama saati geçmiş ama hâlâ "başlamadı" görünen maç bu kadar süre aktif sayılır (gecikmiş durum güncellemesi). */
const LATE_START_GRACE_MS = 3 * 60 * 60_000;

export const ACTIVE_POLL_MS = 30_000;
export const IDLE_POLL_MS = 5 * 60_000;
export const MAX_BACKOFF_POLL_MS = 5 * 60_000;

type MatchLike = Pick<Match, 'status' | 'date' | 'scheduled'>;

/** `date` (YYYY-MM-DD) + `scheduled` (HH:MM, UTC — Sportmonks `starting_at`'ten) → ms; bilinmiyorsa null. */
export function matchKickoffMs(m: MatchLike): number | null {
  if (!m.date || !m.scheduled || !/^\d{2}:\d{2}/.test(m.scheduled)) return null;
  const t = Date.parse(`${m.date}T${m.scheduled.slice(0, 5)}:00Z`);
  return Number.isFinite(t) ? t : null;
}

export function isMatchLive(m: MatchLike): boolean {
  return m.status === 'IN PLAY' || m.status === 'HALF TIME BREAK';
}

export function isMatchActive(m: MatchLike, now: number): boolean {
  if (isMatchLive(m)) return true;
  if (m.status !== 'NOT STARTED') return false;
  const k = matchKickoffMs(m);
  if (k == null) return false;
  const delta = k - now;
  return Math.abs(delta) <= ACTIVE_WINDOW_MS || (delta < 0 && delta > -LATE_START_GRACE_MS);
}

export function hasActiveMatch(matches: readonly MatchLike[], now: number = Date.now()): boolean {
  return matches.some((m) => isMatchActive(m, now));
}

/**
 * Listenin taze kalma süresi (sn): aktifse 30; değilse sıradaki başlamaya (−15 dk) kadar, `maxSeconds`
 * ile sınırlı, en az 30.
 */
export function matchListFreshSeconds(matches: readonly MatchLike[], maxSeconds: number, now: number = Date.now()): number {
  if (hasActiveMatch(matches, now)) return 30;
  let untilNext = Infinity;
  for (const m of matches) {
    if (m.status !== 'NOT STARTED') continue;
    const k = matchKickoffMs(m);
    if (k != null && k > now) untilNext = Math.min(untilNext, (k - now - ACTIVE_WINDOW_MS) / 1000);
  }
  return Math.max(30, Math.min(maxSeconds, Math.floor(untilNext)));
}

/**
 * Ana sayfa polling aralığı: aktif liste → 30 sn, aksi halde 5 dk. Ardışık hatalarda üstel bekleme
 * (30 sn · 2^n, en çok 5 dk) — upstream sorunluyken istemciler kotayı zorlamasın.
 */
export function homePollDelayMs(matches: readonly MatchLike[], consecutiveFailures = 0, now: number = Date.now()): number {
  if (consecutiveFailures > 0) return Math.min(MAX_BACKOFF_POLL_MS, ACTIVE_POLL_MS * 2 ** consecutiveFailures);
  return hasActiveMatch(matches, now) ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
