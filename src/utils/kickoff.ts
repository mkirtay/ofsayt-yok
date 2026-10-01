import type { Match } from '@/models/liveScore';
import { matchIstanbulDate, matchKickoffMs } from './matchActivity';
import { utcTimeToTr } from './dateFormat';
import { shiftIsoDate } from './fixtureDateLabel';
import { todayIsoIstanbul } from './dateStrip';

/** Maç öncesi ekranların başlama bilgisi: İstanbul saati ("21:30") ve günü (YYYY-MM-DD); bilinmiyorsa null. */
export type KickoffInfo = { ms: number; time: string; dayIso: string };

export function kickoffInfo(match: Pick<Match, 'date' | 'scheduled' | 'status'> | null | undefined): KickoffInfo | null {
  if (!match) return null;
  const ms = matchKickoffMs(match);
  const dayIso = matchIstanbulDate(match);
  if (ms == null || !dayIso || !match.scheduled) return null;
  return { ms, time: utcTimeToTr(match.scheduled.slice(0, 5), match.date), dayIso };
}

/** Başlama günü bugün/yarın mı (İstanbul günü). Saate bağlı: yalnız mount sonrası çağrılır. */
export function relativeKickoffDay(dayIso: string, nowMs: number): 'today' | 'tomorrow' | null {
  const today = todayIsoIstanbul(new Date(nowMs));
  if (dayIso === today) return 'today';
  if (dayIso === shiftIsoDate(today, 1)) return 'tomorrow';
  return null;
}

export type Countdown =
  | { kind: 'left'; days: number; hours: number; minutes: number }
  /** Bir dakikadan az kaldı. */
  | { kind: 'soon' }
  /** Saati geçti ama durum hâlâ "başlamadı". */
  | { kind: 'awaiting' };

/**
 * Geri sayım parçaları: 1 günden fazlaysa gün + saat, 1 saatten fazlaysa saat + dakika, değilse dakika.
 * Dakikalar yukarı yuvarlanır ("1 dk" kalana kadar 0 görünmez).
 */
export function countdown(kickoffMs: number, nowMs: number): Countdown {
  const left = kickoffMs - nowMs;
  if (left <= 0) return { kind: 'awaiting' };
  if (left < 60_000) return { kind: 'soon' };
  const totalMinutes = Math.ceil(left / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return { kind: 'left', days, hours, minutes: 0 };
  return { kind: 'left', days: 0, hours, minutes };
}
