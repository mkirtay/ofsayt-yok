import type { Match, MatchStateCode } from '@/models/liveScore';
import { deriveMatchPhase, type MatchPhase } from './matchPhase';

/** Ekranda ayrıca anlatılan özel durumlar (kartlarda tek mesaj ya da durum satırı, listede kısa etiket). */
export type MatchSpecialState = 'postponed' | 'cancelled' | 'abandoned' | 'tba' | 'delayed' | 'suspended' | 'awarded';

export type MatchDisplayState = {
  /** 4 kovalı evre (PRE / LIVE / HT / POST) — mevcut mantık değişmez. */
  phase: MatchPhase;
  /** Kovanın yuttuğu özel durum; normal maçta null. */
  special: MatchSpecialState | null;
};

const SPECIAL_BY_CODE: Partial<Record<MatchStateCode, MatchSpecialState>> = {
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
  DELETED: 'cancelled',
  ABANDONED: 'abandoned',
  TBA: 'tba',
  DELAYED: 'delayed',
  SUSPENDED: 'suspended',
  INTERRUPTED: 'suspended',
  AWARDED: 'awarded',
  WALKOVER: 'awarded',
  // PENDING: ayrı anlatılmaz, normal "başlamadı".
};

export function matchDisplayState(match: Pick<Match, 'status' | 'state_code'> | null | undefined): MatchDisplayState {
  return {
    phase: deriveMatchPhase(match?.status),
    special: (match?.state_code && SPECIAL_BY_CODE[match.state_code]) || null,
  };
}

/**
 * Oynanmış kısmı olabilecek özel durumlar: veri varsa veri görünür, kartın üstünde durum satırı. Diğerlerinde
 * (ertelendi, iptal, tarih belirsiz, gecikti) kartlarda yalnız durumu söyleyen tek mesaj.
 */
export function specialKeepsData(special: MatchSpecialState): boolean {
  return special === 'abandoned' || special === 'suspended' || special === 'awarded';
}
