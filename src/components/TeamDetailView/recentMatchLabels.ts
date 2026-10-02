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
