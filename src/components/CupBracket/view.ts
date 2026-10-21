/** Eleme ağacı görünümü için saf yardımcılar (test edilir). */
import type { CupBracket, CupLeg, CupRound, CupTeam, CupTie } from '@/services/cupBracket/types';
import { isLegFinished, isLegLive } from '@/services/cupBracket/legState';

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Tur adı: ağaç turu yuvadan; ön eleme / erken tur Sportmonks adındaki numaradan ("Qualification Round 2" → "2. Ön Eleme"). */
export function roundLabel(round: Pick<CupRound, 'slot' | 'kind' | 'name'>, t: T): string {
  if (round.slot) return t(`slot.${round.slot}`);
  const n = /(\d+)/.exec(round.name)?.[1];
  if (round.kind === 'qualifying') {
    if (/play-?off/i.test(round.name)) return t('qualifyingPlayoff');
    return n ? t('qualifyingRound', { n }) : round.name;
  }
  return n ? t('earlyRound', { n }) : round.name;
}

export type Connector = 'pairTop' | 'pairBottom' | 'straight' | null;

/**
 * Ağaçta bir eşleşmeden sonraki tura çizgi: sonraki tur yarıya iniyorsa 2k/2k+1 → k (üst/alt kol), eşit sayıdaysa
 * k → k (düz). Yalnız eşleşme gerçekten o kutuya bağlıysa (nextTieId) çizilir.
 */
export function connectorsFor(rounds: CupRound[]): Connector[][] {
  return rounds.map((r, i) => {
    const next = rounds[i + 1];
    return r.ties.map((tie, row) => {
      if (!next) return null;
      if (next.ties.length * 2 === r.ties.length) {
        return tie.nextTieId === next.ties[Math.floor(row / 2)]?.id ? (row % 2 === 0 ? 'pairTop' : 'pairBottom') : null;
      }
      if (next.ties.length === r.ties.length) return tie.nextTieId === next.ties[row]?.id ? 'straight' : null;
      return null;
    });
  });
}

export const treeRounds = (b: CupBracket) => b.rounds.filter((r) => r.kind === 'bracket');
export const listRounds = (b: CupBracket) => b.rounds.filter((r) => r.kind !== 'bracket');

/**
 * Varsayılan seçim. Masaüstü: güncel tur ağaç öncesindeyse o tur, değilse ağaç (`'tree'`). Mobil (tur tur liste):
 * güncel tur; yoksa kurası beklenen ilk ağaç turu; o da yoksa son tur (Final).
 */
export function defaultSelection(b: CupBracket): { desktop: string; mobile: string } {
  const current = b.rounds.find((r) => r.status === 'current');
  const tree = treeRounds(b);
  const mobile = current?.key ?? tree.find((r) => r.status === 'tbd')?.key ?? b.rounds[b.rounds.length - 1]?.key ?? 'tree';
  const desktop = current && current.kind !== 'bracket' ? current.key : 'tree';
  return { desktop, mobile };
}

export const isTbdTie = (tie: CupTie) => tie.home == null || tie.away == null;

/** Takımın bir ayaktaki golü (ayağın kendi ev/deplasmanından bağımsız). */
export function goalsFor(leg: CupLeg, teamId: number): number | null {
  return leg.homeId === teamId ? leg.homeGoals : leg.awayId === teamId ? leg.awayGoals : null;
}

/** Kutunun bağlantı verdiği maç: canlı → sıradaki oynanmamış → son ayak. */
export function primaryLeg(tie: CupTie): CupLeg | null {
  return (
    tie.legs.find((l) => isLegLive(l.stateId)) ??
    tie.legs.find((l) => !isLegFinished(l.stateId) && l.homeGoals == null && l.startingAt != null) ??
    tie.legs[tie.legs.length - 1] ??
    null
  );
}

export function legTeams(tie: CupTie, leg: CupLeg): { home: CupTeam | null; away: CupTeam | null } {
  const byId = (id: number | null) => (id == null ? null : tie.home?.id === id ? tie.home : tie.away?.id === id ? tie.away : null);
  return { home: byId(leg.homeId), away: byId(leg.awayId) };
}

export function formatKickoff(iso: string | null, locale: string, withTime: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', {
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Europe/Istanbul',
  }).format(d);
}

/** Kutunun alt satırı: canlı / nasıl bitti / sıradaki maçın tarihi / son maçın tarihi. */
export function tieMeta(tie: CupTie, t: T, locale: string, now: number = Date.now()): { text: string; live: boolean } {
  if (tie.legs.some((l) => isLegLive(l.stateId))) return { text: t('live'), live: true };
  if (tie.winnerId != null && tie.decidedBy) {
    const base = t(`decided.${tie.decidedBy}`);
    return { text: tie.decidedBy === 'pen' && tie.pens ? `${base} ${tie.pens.home}–${tie.pens.away}` : base, live: false };
  }
  const next = tie.legs.find((l) => !isLegFinished(l.stateId) && l.homeGoals == null);
  // Ertelenip hiç oynanmayan maç (başlama saatinden 3 gün sonra hâlâ başlamadı).
  if (next?.startingAt && now - Date.parse(next.startingAt) > 3 * 86_400_000) return { text: t('notPlayed'), live: false };
  if (next) {
    const idx = tie.legs.indexOf(next);
    const when = formatKickoff(next.startingAt, locale, true);
    return { text: tie.legs.length > 1 && idx > 0 ? `${t('leg', { n: idx + 1 })}: ${when}` : when, live: false };
  }
  return { text: formatKickoff(tie.legs[tie.legs.length - 1]?.startingAt ?? null, locale, false), live: false };
}
