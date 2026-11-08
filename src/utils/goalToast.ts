import { parseScore } from './parseScore';
import type { GoalEvent, GoalSide } from './goalDetection';

/**
 * Ekran dışındaki maçta gol bildirimi (ana sayfa listesi). Algılama `detectGoals` sonucundan türetilir — yeni istek yok.
 * Bu modül saf mantık: hangi gol bildirilir, kuyruk nasıl ilerler. Görünüm `components/GoalToast` (tembel yüklenir).
 */

export type GoalToastTeam = { name: string; logo?: string };

export type GoalToastItem = {
  /** `detectGoals` anahtarı (`id:ev-dep`) — aynı gol iki kez bildirilmesin diye. */
  key: string;
  matchId: string;
  side: GoalSide;
  home: GoalToastTeam;
  away: GoalToastTeam;
  score: [number, number];
  /** "67'" — dakika bilinmiyorsa boş. */
  minute: string;
  href: string;
};

/**
 * Bildirime uygun gol: skor okunabiliyor ve HİÇBİR taraf azalmadı (VAR iptali / düzeltme "1-0 → 0-1" bildirim
 * üretmez; `detectGoals` yalnız artan tarafa bakar).
 */
export function isCleanGoal(before: string | undefined, after: string | undefined): boolean {
  const b = parseScore(before);
  const a = parseScore(after);
  if (!b || !a) return false;
  if (a[0] < b[0] || a[1] < b[1]) return false;
  return a[0] > b[0] || a[1] > b[1];
}

/** `detectGoals` sonucundan bildirime uygun olanların id'leri (sıra korunur). */
export function toastableGoalIds(
  goals: ReadonlyMap<string, GoalEvent>,
  previous: ReadonlyMap<string, string>,
  next: ReadonlyMap<string, string>,
): string[] {
  const ids: string[] = [];
  for (const id of goals.keys()) {
    if (isCleanGoal(previous.get(id), next.get(id))) ids.push(id);
  }
  return ids;
}

/** Sayfa açılışından / sekmeye dönüşten sonra bu kadar süre gol bildirimi yok (eski skorların yetişmesi "gol" sayılmasın). */
export const GOAL_TOAST_ARM_MS = 15_000;

/**
 * Bildirim üretilebilir mi: sekme görünür ve son "uyanma"dan (ilk yükleme ya da sekmeye dönüş) beri yeterli süre geçti.
 * Sekme gizliyken ya da dönüşte gelen ilk tazelemedeki skor artışları birikmiş eski gollerdir → bildirilmez.
 */
export function goalToastsArmed(now: number, awakeSince: number, hidden: boolean): boolean {
  return !hidden && now - awakeSince >= GOAL_TOAST_ARM_MS;
}

export type GoalToastQueue = { visible: GoalToastItem[]; queued: GoalToastItem[] };

export const EMPTY_GOAL_TOAST_QUEUE: GoalToastQueue = { visible: [], queued: [] };
export const GOAL_TOAST_MAX_VISIBLE = 2;
/** Bekleyen en fazla bu kadar; taşarsa en eskisi düşer (yoğun akşamda dakikalar sonra eski gol çıkmasın). */
export const GOAL_TOAST_MAX_QUEUED = 3;

/**
 * Yeni golleri kuyruğa ekler. Aynı anahtar (aynı gol) yoksayılır; aynı maçın daha yeni golü eskisinin YERİNİ alır
 * (görünürdeyse yerinde güncellenir, beklemedeyse kuyruktaki kaydı değişir) — bir maç için iki bildirim olmaz.
 * Görünür alan dolana kadar doğrudan görünür olur, kalanı bekler.
 */
export function enqueueGoalToasts(state: GoalToastQueue, incoming: readonly GoalToastItem[]): GoalToastQueue {
  let visible = state.visible;
  let queued = state.queued;
  for (const item of incoming) {
    if (visible.some((v) => v.key === item.key) || queued.some((q) => q.key === item.key)) continue;
    if (visible.some((v) => v.matchId === item.matchId)) {
      visible = visible.map((v) => (v.matchId === item.matchId ? item : v));
      continue;
    }
    if (queued.some((q) => q.matchId === item.matchId)) {
      queued = queued.map((q) => (q.matchId === item.matchId ? item : q));
      continue;
    }
    if (visible.length < GOAL_TOAST_MAX_VISIBLE) visible = [...visible, item];
    else queued = [...queued, item].slice(-GOAL_TOAST_MAX_QUEUED);
  }
  return visible === state.visible && queued === state.queued ? state : { visible, queued };
}

/** Görünür bildirimi kapatır; boşalan yere kuyruğun başı geçer. */
export function dismissGoalToast(state: GoalToastQueue, key: string): GoalToastQueue {
  if (!state.visible.some((v) => v.key === key)) return state;
  const visible = state.visible.filter((v) => v.key !== key);
  const [next, ...rest] = state.queued;
  return next ? { visible: [...visible, next], queued: rest } : { visible, queued: state.queued };
}

/**
 * Satırın görünür kısmı: hem pencerenin hem liste kutusunun içinde kalan yükseklik / satır yüksekliği (0–1).
 * Liste kutusu gizliyse (sıfır boyut) 0.
 */
export function visibleFraction(
  row: { top: number; bottom: number },
  container: { top: number; bottom: number } | null,
  viewportHeight: number,
): number {
  const height = row.bottom - row.top;
  if (height <= 0) return 0;
  let top = Math.max(row.top, 0);
  let bottom = Math.min(row.bottom, viewportHeight);
  if (container) {
    if (container.bottom - container.top <= 0) return 0;
    top = Math.max(top, container.top);
    bottom = Math.min(bottom, container.bottom);
  }
  return Math.max(0, bottom - top) / height;
}
