/**
 * Gol post'u için SAF (ağ/DB'siz) veri kuralları: olay sınıflama, skor ve lig bazlı gol krallığı sırası.
 * Metin üretimi `goalTemplates.ts`; veri çekme `goalDraft.ts`. Burada LLM/serbest metin YOK — yalnızca sayılar.
 *
 * Sportmonks olay tipleri (docs/SPORTMONKS_MIGRATION.md): 14 Goal, 15 Own Goal, 16 Penalty (atılan penaltı = gol),
 * 17 Missed Penalty, 22/23 penaltı atışları (seri; skora/gol krallığına SAYILMAZ), 10 VAR.
 */
import type { SportmonksEventRow } from '@/services/sportmonks/types';

export const EVENT_TYPE_GOAL = 14;
export const EVENT_TYPE_OWN_GOAL = 15;
export const EVENT_TYPE_PENALTY_SCORED = 16;

export type GoalKind = 'goal' | 'penalty' | 'own-goal';

/** Olay gol değilse (kart, oyuncu değişikliği, kaçan penaltı, seri penaltı…) null. */
export function goalKindOf(e: Pick<SportmonksEventRow, 'type_id'>): GoalKind | null {
  if (e.type_id === EVENT_TYPE_GOAL) return 'goal';
  if (e.type_id === EVENT_TYPE_PENALTY_SCORED) return 'penalty';
  if (e.type_id === EVENT_TYPE_OWN_GOAL) return 'own-goal';
  return null;
}

/** Golcü kredisi (gol krallığı): normal gol + atılan penaltı. KENDİ KALESİNE gol kimseye kredi yazmaz. */
export function isCreditedGoal(e: SportmonksEventRow): boolean {
  const k = goalKindOf(e);
  return (k === 'goal' || k === 'penalty') && typeof e.player_id === 'number';
}

/** Kronolojik sıra: dakika, uzatma dakikası, sort_order, id. */
export function sortEvents(events: readonly SportmonksEventRow[]): SportmonksEventRow[] {
  return [...events].sort(
    (a, b) =>
      a.minute - b.minute ||
      (a.extra_minute ?? 0) - (b.extra_minute ?? 0) ||
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.id - b.id,
  );
}

/** `eventId` DAHİL o ana kadarki olaylar (kronolojik). Olay yoksa null. */
export function eventsUpTo(events: readonly SportmonksEventRow[], eventId: number): SportmonksEventRow[] | null {
  const sorted = sortEvents(events);
  const idx = sorted.findIndex((e) => e.id === eventId);
  return idx < 0 ? null : sorted.slice(0, idx + 1);
}

export type ScoreAtEvent = {
  home: number;
  away: number;
  /**
   * false → o ana kadar kendi kalesine gol var. Sportmonks'ta `participant_id`'nin kendi kalesine golde hangi takımı
   * (golü atan/yiyen) gösterdiği doğrulanmadı → skor GÜVENİLMEZ, şablon skoru yazmaz.
   */
  reliable: boolean;
};

/** Skor tablosu: yalnızca olaylardan türetilir (canlı fixture skoru ile yarış yok). Seri penaltılar sayılmaz. */
export function scoreAtEvent(upTo: readonly SportmonksEventRow[], homeId: number, awayId: number): ScoreAtEvent {
  let home = 0;
  let away = 0;
  let reliable = true;
  for (const e of upTo) {
    const k = goalKindOf(e);
    if (!k) continue;
    if (k === 'own-goal') {
      reliable = false;
      continue;
    }
    if (e.participant_id === homeId) home += 1;
    else if (e.participant_id === awayId) away += 1;
    else reliable = false;
  }
  return { home, away, reliable };
}

export type SeasonScorer = { playerId: number; goals: number };

export type LeaderStatus = 'sole' | 'joint' | 'none';

export type ScorerStanding = {
  goals: number;
  /** Yarışmalı sıralama: kendinden KESİNLİKLE fazla golü olanların sayısı + 1 (beraberlikte ikisi de 1.). */
  rank: number;
  leader: LeaderStatus;
};

function standingOf(playerId: number, totals: Map<number, number>): ScorerStanding {
  const goals = totals.get(playerId) ?? 0;
  let higher = 0;
  let tied = 0;
  for (const [id, g] of totals) {
    if (id === playerId) continue;
    if (g > goals) higher += 1;
    else if (g === goals) tied += 1;
  }
  const rank = higher + 1;
  return { goals, rank, leader: rank === 1 ? (tied > 0 ? 'joint' : 'sole') : 'none' };
}

export type GoalMilestone =
  | { kind: 'took-lead'; goals: number }
  | { kind: 'joint-lead'; goals: number }
  | { kind: 'extended-lead'; goals: number }
  | { kind: 'top-rank'; goals: number; rank: number }
  | { kind: 'none' };

export const TOP_RANK_LIMIT = 5;

export type StandingResult = { before: ScorerStanding; after: ScorerStanding; milestone: GoalMilestone };

/**
 * `scorerId`'nin bu golden ÖNCE/SONRA lig (sezon) gol krallığı sırası.
 *
 * `baseline` = sezon topscorer tablosu. Varsayılan varsayım: tablo bu maçın golleri İŞLENMEDEN önceki durumu yansıtır
 * (`baselineIncludesLiveGoals=false`) → maçta `eventId`'ye kadar atılan TÜM krediler (her iki takım) üstüne eklenir.
 * true ise tablo zaten canlı golleri içerir: olduğu gibi kullanılır, golcünün "önceki" değeri 1 eksik alınır.
 * (Sportmonks topscorer tablosunun canlı maçta güncellenip güncellenmediği DOĞRULANMADI — bkz. docs/GUNDEM_BOT_TASLAK.md.)
 */
export function computeStanding(args: {
  scorerId: number;
  baseline: readonly SeasonScorer[];
  upToEvent: readonly SportmonksEventRow[];
  baselineIncludesLiveGoals?: boolean;
}): StandingResult {
  const { scorerId, baseline, upToEvent, baselineIncludesLiveGoals = false } = args;

  const after = new Map<number, number>(baseline.map((s) => [s.playerId, s.goals]));
  const before = new Map(after);

  if (baselineIncludesLiveGoals) {
    before.set(scorerId, Math.max(0, (before.get(scorerId) ?? 0) - 1));
  } else {
    const last = upToEvent[upToEvent.length - 1];
    for (const e of upToEvent) {
      if (!isCreditedGoal(e)) continue;
      const id = e.player_id as number;
      after.set(id, (after.get(id) ?? 0) + 1);
      if (e !== last) before.set(id, (before.get(id) ?? 0) + 1);
    }
  }

  const b = standingOf(scorerId, before);
  const a = standingOf(scorerId, after);
  return { before: b, after: a, milestone: milestoneOf(b, a) };
}

function milestoneOf(before: ScorerStanding, after: ScorerStanding): GoalMilestone {
  if (after.leader === 'sole') {
    return before.leader === 'sole' ? { kind: 'extended-lead', goals: after.goals } : { kind: 'took-lead', goals: after.goals };
  }
  if (after.leader === 'joint') return { kind: 'joint-lead', goals: after.goals };
  if (after.rank <= TOP_RANK_LIMIT) return { kind: 'top-rank', goals: after.goals, rank: after.rank };
  return { kind: 'none' };
}
