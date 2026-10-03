/**
 * İki ayaklı eşleşmede toplam skor (aggregate) — yalnız 2. ayakta ("2/2") gösterilir.
 *
 * Kaynak sırası: Sportmonks `aggregate` (eşleşme bitince gelir; mapper BU maçın ev sahibine göre çevirir) →
 * yoksa (2. ayak oynanmamış ya da canlı) 1. ayağın skoru + bu maçın güncel skoru. 1. ayağın ev sahibi bu maçın
 * deplasmanıdır. Uzatma toplama dahil (Sportmonks CURRENT), penaltılar hariç; penaltılı bitişte ayrıca "PEN 4–3".
 */
import type { Match } from '@/models/liveScore';

export type TieSummary = {
  /** Toplam — BU maçın ev sahibine göre. */
  home: number;
  away: number;
  /** Bu maçın penaltı atışları (varsa). */
  penalties?: { home: number; away: number };
  /** Turu geçen; yalnız maç bittiyse. */
  winner: 'home' | 'away' | null;
};

export function parseScorePair(raw: string | null | undefined): [number, number] | null {
  const m = /^\s*(\d+)\s*[-–:]\s*(\d+)\s*$/.exec(raw ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** İki ayaklı eşleşmenin 2. maçı mı ("2/2"). */
export function isSecondLeg(match: Pick<Match, 'leg'> | null | undefined): boolean {
  return /^2\/2$/.test(match?.leg?.trim() ?? '');
}

/** Aday maç bu 2. ayağın 1. ayağı mı: aynı turnuva, ev sahibi / deplasman ters, "1/2", önceki tarih. */
export function isFirstLegOf(secondLeg: Match, candidate: Match): boolean {
  if (!/^1\/2$/.test(candidate.leg?.trim() ?? '')) return false;
  if (candidate.home?.id !== secondLeg.away?.id || candidate.away?.id !== secondLeg.home?.id) return false;
  const a = candidate.competition?.id ?? candidate.competition_id;
  const b = secondLeg.competition?.id ?? secondLeg.competition_id;
  if (a != null && b != null && a !== b) return false;
  return !candidate.date || !secondLeg.date || candidate.date <= secondLeg.date;
}

/** Adaylar arasından (ör. karşılaşma geçmişi) 1. ayak: en yakın tarihli eşleşen maç. */
export function pickFirstLeg(secondLeg: Match, candidates: Match[]): Match | null {
  const legs = candidates.filter((c) => isFirstLegOf(secondLeg, c));
  legs.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));
  return legs[0] ?? null;
}

function decideWinner(home: number, away: number, pens: TieSummary['penalties']): TieSummary['winner'] {
  if (home !== away) return home > away ? 'home' : 'away';
  if (pens && pens.home !== pens.away) return pens.home > pens.away ? 'home' : 'away';
  return null;
}

/** 2. ayak değilse ya da hesaplanamıyorsa null. */
export function tieSummary(match: Match, firstLeg?: Match | null): TieSummary | null {
  if (!isSecondLeg(match)) return null;
  const finished = match.status === 'FINISHED';
  const ps = parseScorePair(match.scores?.ps_score);
  const penalties = ps ? { home: ps[0], away: ps[1] } : undefined;

  if (match.aggregate) {
    const { home, away, winner_id } = match.aggregate;
    const byId = winner_id == null ? null : winner_id === match.home?.id ? 'home' : winner_id === match.away?.id ? 'away' : null;
    return { home, away, ...(penalties ? { penalties } : {}), winner: finished ? (byId ?? decideWinner(home, away, penalties)) : null };
  }

  if (!firstLeg) return null;
  const first = parseScorePair(firstLeg.scores?.score ?? firstLeg.score);
  if (!first) return null;
  // Başlamamış 2. ayakta skor yok → toplam = 1. ayak.
  const current = parseScorePair(match.scores?.score ?? match.score) ?? [0, 0];
  const home = first[1] + current[0];
  const away = first[0] + current[1];
  return { home, away, ...(penalties ? { penalties } : {}), winner: finished ? decideWinner(home, away, penalties) : null };
}
