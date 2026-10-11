/**
 * Topluluk tahmini (1X2 anketi) başlama düdüğüyle kilitlenir. Saf karar — sunucu (`server/matchPollLock.ts`, POST'u
 * reddeder) ve istemci (`MatchPoll`, kilitli görünüm) aynı kuralı kullanır.
 */
import type { Match, MatchStateCode } from '@/models/liveScore';
import { deriveMatchPhase } from './matchPhase';
import { matchKickoffMs } from './matchActivity';

/**
 * Maç oynanmayacak / yeni bir tarihe kaydı: başlama saati geçse de anket açık kalır (ertelendi, tarih belirsiz,
 * gecikti). Bunlar Sportmonks'ta "NOT STARTED" kovasında görünür.
 */
const OPEN_AFTER_KICKOFF: ReadonlySet<MatchStateCode> = new Set(['POSTPONED', 'TBA', 'DELAYED']);

/** Sonucu belli / maç fiilen başlamış özel durumlar: kova "NOT STARTED" görünse bile kilit. */
const ALWAYS_LOCKED: ReadonlySet<MatchStateCode> = new Set([
  'CANCELLED',
  'DELETED',
  'ABANDONED',
  'SUSPENDED',
  'INTERRUPTED',
  'AWARDED',
  'WALKOVER',
]);

export type PollLockMatch = Pick<Match, 'status' | 'state_code' | 'date' | 'scheduled'>;

/**
 * Kilit: maç başlamış/bitmiş (PRE dışı evre), sonucu belli bir özel durumda ya da hâlâ "başlamadı" görünse de başlama
 * saati geçmiş (liste cache'i birkaç saniye–dakika geride kalabilir). Ertelenen/gecikenler saat geçse de açık.
 */
export function isPollLockedForMatch(match: PollLockMatch, now: number = Date.now()): boolean {
  if (deriveMatchPhase(match.status) !== 'PRE') return true;
  const code = match.state_code;
  if (code && ALWAYS_LOCKED.has(code)) return true;
  if (code && OPEN_AFTER_KICKOFF.has(code)) return false;
  const kickoff = matchKickoffMs(match);
  return kickoff != null && now >= kickoff;
}

/** Yalnız başlama saati bilinen kaynak (MatchSnapshot): saat geldiyse kilit. */
export function isPollLockedForKickoff(startingAt: Date, now: number = Date.now()): boolean {
  return now >= startingAt.getTime();
}
