/**
 * Son Maçlar satırının sol sütunu: bitmiş maçta tarih ("19.09"), canlıda dakika, ertelenmiş/iptalde kısa durum.
 */
import type { Match } from '@/models/liveScore';
import { istanbulMatchDate } from '@/utils/fixtureDateGroups';
import { matchDisplayState } from '@/utils/matchDisplayState';
import { utcTimeToTr } from '@/utils/dateFormat';

/** TR gününe göre "GG.AA"; tarih yoksa boş. */
export function shortMatchDate(match: Match): string {
  const iso = istanbulMatchDate(match);
  if (!iso) return '';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** TR gününe göre "GG.AA.YYYY" (satırın `title`'ı). */
export function fullMatchDate(match: Match): string {
  const iso = istanbulMatchDate(match);
  if (!iso) return '';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

export type RecentStatus =
  | { kind: 'date'; text: string }
  | { kind: 'live'; text: string }
  | { kind: 'special'; key: 'postponedShort' | 'cancelledShort'; full: 'postponed' | 'cancelled' };

/** Satırdaki durum etiketi (çeviri anahtarları `match:list.*`). */
export function recentMatchStatus(match: Match): RecentStatus {
  const s = (match.status ?? '').toUpperCase();
  if (s === 'IN PLAY') return { kind: 'live', text: match.time ? `${String(match.time).replace(/'$/u, '')}'` : 'CANLI' };
  if (s === 'HALF TIME BREAK' && !match.state_code) return { kind: 'live', text: 'İY' };
  const { special } = matchDisplayState(match);
  if (special === 'postponed' || special === 'tba' || special === 'delayed') {
    return { kind: 'special', key: 'postponedShort', full: 'postponed' };
  }
  if (special === 'cancelled' || special === 'abandoned') return { kind: 'special', key: 'cancelledShort', full: 'cancelled' };
  if (s === 'NOT STARTED' && match.scheduled && !shortMatchDate(match)) {
    return { kind: 'date', text: utcTimeToTr(match.scheduled, match.date) };
  }
  return { kind: 'date', text: shortMatchDate(match) };
}

export type NextCountdown = { kind: 'today' | 'tomorrow' | 'days'; days: number };

/** Sıradaki maça kalan gün (TR günü): bugün / yarın / N gün. */
export function nextMatchCountdown(match: Match, todayIso: string): NextCountdown | null {
  const iso = istanbulMatchDate(match);
  if (!iso || !todayIso) return null;
  const days = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${todayIso}T12:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  return { kind: days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'days', days };
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Sıradaki maç kutusunun geri sayımı: "Bugün 20:00" / "Yarın 20:00" / "7 gün kaldı" (saat yoksa yalnız gün). */
export function countdownLabel(cd: NextCountdown | null, time: string | null, t: Translate): string {
  if (!cd) return '';
  if (cd.kind === 'days') return t('nextBox.days', { count: cd.days });
  const base = cd.kind === 'today' ? 'nextBox.today' : 'nextBox.tomorrow';
  return time ? t(base, { time }) : t(`${base}NoTime`);
}
