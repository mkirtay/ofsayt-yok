/**
 * Tahmin oyunu sonuç kararı (saf). Girdi: oyundaki maç + sağlayıcıdaki karşılığı (önbellekteki gün listesinden ya da yedek
 * `fixtures/{id}`'den; yoksa null). Çıktı: ne yapılacağı. DB / ağ yok → tablo testli (settleDecision.test.ts).
 *
 * Kurallar (plan §3.5, §5.2):
 * - İptal / silindi / yarıda kaldı / hükmen / walkover → VOID (hükmen skor tahmin sonucu sayılmaz).
 * - Bitti ve normal süre skoru okunuyor → FINISH.
 * - Başlamamış görünüyor ama başlama saati değişmiş → kickoff güncelle; yeni saat hafta dışındaysa VOID.
 * - Canlı görünüyor ama bizde başlama saati gelecekte → kickoff = şimdi (erken kilit).
 * - Sağlayıcıda yok: başlama +4 sa sonra saatte en çok bir yedek sorgu; başlama +3 gün → VOID (UNRESOLVED).
 */
import type { Match } from '@/models/liveScore';
import { extractFinalScore, isMatchFinished, parseScoreGoals } from '@/lib/matchResult';
import { matchKickoffMs } from '@/utils/matchActivity';

export const FALLBACK_AFTER_MS = 4 * 3_600_000;
export const FALLBACK_EVERY_MS = 3_600_000;
export const UNRESOLVED_AFTER_MS = 3 * 86_400_000;
/** Gün listesine bakılacak pencere: başlamaya bu kadar kala ve sonrası (uzak maçlar için istek yok). */
export const LIST_LOOKAHEAD_MS = 3 * 3_600_000;

const VOID_CODES = new Set(['CANCELLED', 'DELETED', 'ABANDONED', 'AWARDED', 'WALKOVER']);

export type DecisionInput = {
  kickoffAt: Date;
  weekStartsAt: Date;
  weekEndsAt: Date;
  checkedAt: Date | null;
  now: Date;
};

export type Decision =
  | { kind: 'none' }
  | { kind: 'finish'; home: number; away: number }
  | { kind: 'void'; reason: string }
  | { kind: 'kickoff'; at: Date }
  | { kind: 'fallback' };

function isLive(m: Match): boolean {
  const s = String(m.status ?? '').toUpperCase();
  return s === 'IN PLAY' || s === 'HALF TIME BREAK' || s === 'LIVE' || s === 'HT';
}

/** `provider`: sağlayıcıdaki maç (null → bulunamadı). `viaFallback`: yedek sorgunun sonucu (bir daha yedeğe gitme). */
export function decideMatch(input: DecisionInput, provider: Match | null, viaFallback = false): Decision {
  const { kickoffAt, now } = input;
  const sinceKickoff = now.getTime() - kickoffAt.getTime();

  if (provider) {
    const code = provider.state_code;
    if (code && VOID_CODES.has(code)) return { kind: 'void', reason: code };
    if (isMatchFinished(provider) && !code) {
      const score = parseScoreGoals(extractFinalScore(provider));
      if (score) return { kind: 'finish', home: score[0], away: score[1] };
    }
    if (isLive(provider)) {
      return kickoffAt > now ? { kind: 'kickoff', at: now } : { kind: 'none' };
    }
    if (!isMatchFinished(provider)) {
      const k = matchKickoffMs(provider);
      if (k != null && k !== kickoffAt.getTime() && !provider.time_tbd) {
        const at = new Date(k);
        if (at < input.weekStartsAt || at >= input.weekEndsAt) return { kind: 'void', reason: 'MOVED_OUT' };
        // Başlamış maçın saati ileri alınmaz (kilit açılmasın): yalnız henüz başlamamışsa ya da daha erkene çekildiyse.
        if (kickoffAt > now || at < kickoffAt) return { kind: 'kickoff', at: at < now ? now : at };
      }
    }
  }

  if (sinceKickoff > UNRESOLVED_AFTER_MS) return { kind: 'void', reason: provider?.state_code ?? 'UNRESOLVED' };
  if (!viaFallback && sinceKickoff > FALLBACK_AFTER_MS && (!input.checkedAt || now.getTime() - input.checkedAt.getTime() > FALLBACK_EVERY_MS)) {
    return { kind: 'fallback' };
  }
  return { kind: 'none' };
}

/** Maçın gün listesine bakılmalı mı (başlamaya `LIST_LOOKAHEAD_MS` kala ve sonrası)? */
export function needsProviderCheck(kickoffAt: Date, now: Date): boolean {
  return kickoffAt.getTime() - now.getTime() <= LIST_LOOKAHEAD_MS;
}
