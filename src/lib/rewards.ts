/**
 * Kredi teşvikleri — kurallar ve saf planlayıcılar (DB yok; server/rewards.ts uygular). Kullanıcı kararı 2026-11-11:
 *
 * - Başlangıç görevleri: ilk AI analizi, ilk skor tahmini, ilk Gündem paylaşımı/yorumu, ilk Frikik koşusu → her biri +1
 *   (hesap başına bir kez, kullanıcı "Al" der).
 * - tahmin oyunu (haftalık): haftanın bütün maçlarını tahmin edene +1; ilk 3'e +3 / +2 / +1 (en az 5 tahmin, puan > 0).
 * - Frikik (aylık): ayın en az 7 farklı gününde tabloya yazana +2; ayın ilk 3'üne +5 / +4 / +3.
 * - Hepsi yalnız e-postası DOĞRULANMIŞ hesaplara (çoklu hesap çiftliği). Tekrar anahtarı (`CreditTransaction`
 *   `@@unique([userId, idempotencyKey])`) her ödülü kullanıcı başına bir kez yapar.
 *
 * Karar 8 istisnası: tahmin oyunu sıralama ödülü bir tahminin isabetine bağlı TEK kredi hareketidir. Sınırları:
 * oyuna giriş ücretsizdir, kredi yatırılamaz / tahmine kredi harcanamaz (creditPolicy.test.ts korur), ödül nakde
 * çevrilemez. Defter türü sonuç çağrıştırmaz (`GAME_REWARD`).
 */

import { GAME_BRAND } from '@/config/brand';

/** Ödüller bu haftadan / aydan itibaren verilir (eski dönemler için geriye dönük ödül yok). */
export const REWARDS_FROM_WEEK = '2026-W46';
export const REWARDS_FROM_MONTH = '2026-11';
/** Bitmiş dönemler ne kadar geriye kadar taranır (cron kaçarsa yetişsin; daha eskisi taranmaz). */
export const REWARDS_LOOKBACK_DAYS = 21;

export const ONBOARDING_TASKS = ['analysis', 'prediction', 'gundem', 'frikik'] as const;
export type OnboardingTask = (typeof ONBOARDING_TASKS)[number];
export const ONBOARDING_REWARD = 1;

export const GAME_WEEK_FULL_REWARD = 1;
export const GAME_WEEK_TOP_REWARDS = [3, 2, 1] as const;
export const GAME_WEEK_TOP_MIN_PICKS = 5;

export const FRIKIK_MONTH_ACTIVE_DAYS = 7;
export const FRIKIK_MONTH_ACTIVE_REWARD = 2;
export const FRIKIK_MONTH_TOP_REWARDS = [5, 4, 3] as const;

export function isOnboardingTask(v: unknown): v is OnboardingTask {
  return typeof v === 'string' && (ONBOARDING_TASKS as readonly string[]).includes(v);
}

export const onboardingKey = (task: OnboardingTask) => `reward:onboarding:${task}`;

export type RewardType = 'ONBOARDING_REWARD' | 'GAME_REWARD' | 'FRIKIK_REWARD';
export type PlannedReward = { userId: string; amount: number; key: string; note: string };

/** Haftalık tablonun bir satırı (sıralı: 1. önce) — lib/game/sql.ts `weekTopSql`. */
export type WeekBoardRow = { userId: string; points: number; picks: number };

/**
 * Haftanın ödülleri. `rows` görünür tablo sırasıyla (yalnız takma adlı + doğrulanmış hesaplar). İlk 3 = en az
 * `GAME_WEEK_TOP_MIN_PICKS` tahmini ve pozitif puanı olanlar arasında ilk üç (şartı tutmayan atlanır, sıradaki alır).
 */
export function planWeekRewards(weekKey: string, rows: readonly WeekBoardRow[], matchCount: number): PlannedReward[] {
  const out: PlannedReward[] = [];
  if (matchCount > 0) {
    for (const r of rows) {
      if (r.picks >= matchCount) {
        out.push({ userId: r.userId, amount: GAME_WEEK_FULL_REWARD, key: `reward:game-week:${weekKey}:full`, note: `${GAME_BRAND.name} ${weekKey}: bütün maçlar tahmin edildi` });
      }
    }
  }
  const eligible = rows.filter((r) => r.picks >= GAME_WEEK_TOP_MIN_PICKS && r.points > 0).slice(0, GAME_WEEK_TOP_REWARDS.length);
  eligible.forEach((r, i) => {
    out.push({ userId: r.userId, amount: GAME_WEEK_TOP_REWARDS[i]!, key: `reward:game-week:${weekKey}:top`, note: `${GAME_BRAND.name} ${weekKey}: haftanın ${i + 1}.si` });
  });
  return out;
}

/**
 * Frikik ayının ödülleri. `top` aylık tablo sırasıyla (ilk 3 yeter), `active` ayın en az 7 gününde oynayanlar.
 * İlk 3'te doğrulanmamış hesap varsa ödül sıradakine kaymaz (tablo herkese açık; sıra tabloda gördüğün sıradır).
 */
export function planMonthRewards(month: string, top: readonly { userId: string }[], active: readonly { userId: string }[]): PlannedReward[] {
  const out: PlannedReward[] = [];
  for (const r of active) {
    out.push({ userId: r.userId, amount: FRIKIK_MONTH_ACTIVE_REWARD, key: `reward:frikik-month:${month}:active`, note: `Frikik ${month}: ayın ${FRIKIK_MONTH_ACTIVE_DAYS}+ gününde oynandı` });
  }
  top.slice(0, FRIKIK_MONTH_TOP_REWARDS.length).forEach((r, i) => {
    out.push({ userId: r.userId, amount: FRIKIK_MONTH_TOP_REWARDS[i]!, key: `reward:frikik-month:${month}:top`, note: `Frikik ${month}: ayın ${i + 1}.si` });
  });
  return out;
}

/** "2026-11" → önceki ay "2026-10". */
export function previousMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** Ödüllendirilecek bitmiş Frikik ayları: bu aydan önceki ay(lar), `REWARDS_FROM_MONTH` ve sonrası (en çok 2). */
export function finishedRewardMonths(currentMonth: string): string[] {
  const out: string[] = [];
  let m = previousMonth(currentMonth);
  for (let i = 0; i < 2 && m >= REWARDS_FROM_MONTH; i++, m = previousMonth(m)) out.push(m);
  return out;
}

/** Hafta anahtarları aynı biçimde ("YYYY-Www") → metin karşılaştırması kronolojiktir. */
export const isRewardWeek = (weekKey: string) => weekKey >= REWARDS_FROM_WEEK;
