/**
 * Kredi modeli v2 — analiz erişim durumu (okuma ve açma rotalarının ortak kuralı).
 *
 * Erişim (tam analiz) = açma kaydı (AnalysisUnlock) VAR ya da maç BİTTİ (karar 1: bitmiş maçın analizi herkese açık).
 * Premium / yönetici erişimi tek tıkla açar (POST) — okuma yan etki yazmaz.
 * Maç bitti mi: tahmin değerlendirildiyse (evaluatedAt) kesin; değilse maç sayfasıyla aynı önbellekli `fixtures/{id}`
 * isteği (çoğunlukla HIT, 3 sn bütçe). Hata / zaman aşımı → bitmemiş say (kilitli kalır, içerik sızmaz).
 */
import type { MatchAnalysis, PredictionRecord } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { resolveSportmonksMatch } from '@/lib/resolveLiveMatch';
import { SPORTMONKS_TIMEOUT_MS, withSportmonksTimeout } from '@/server/sportmonks/cachedFetch';
import { analysisIsFree, isAdminUser, isPremiumUser } from '@/lib/premium';
import { ANALYSIS_UNLOCK_COST, weeklyFreeIneligibility, weeklyFreeUsed } from '@/lib/analysisUnlock';
import { captureError } from '@/lib/logger';

export type AnalysisViewer = {
  id: string;
  role: string;
  credits: number;
  premiumUntil: Date | null;
  emailVerified: Date | null;
  createdAt: Date;
};

export async function loadViewer(userId: string | null | undefined): Promise<AnalysisViewer | null> {
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, credits: true, premiumUntil: true, emailVerified: true, createdAt: true },
  });
}

export async function isAnalysisMatchFinished(
  analysis: Pick<MatchAnalysis, 'matchId'>,
  predictionRecord: Pick<PredictionRecord, 'evaluatedAt'> | null,
): Promise<boolean> {
  if (predictionRecord?.evaluatedAt) return true;
  try {
    const lookup = await withSportmonksTimeout(SPORTMONKS_TIMEOUT_MS.page, () =>
      resolveSportmonksMatch(analysis.matchId, { lookupAmbiguous: true }),
    );
    return lookup.kind === 'found' && lookup.match.status === 'FINISHED';
  } catch (e) {
    captureError('analysis-finished-check', e);
    return false;
  }
}

export type WeeklyFreeOffer = {
  available: boolean;
  /** Kullanılamıyorsa neden (arayüz metni için). */
  reason: 'USED' | 'EMAIL_NOT_VERIFIED' | 'ACCOUNT_TOO_NEW' | 'SIGNED_OUT' | null;
};

export type AnalysisOffer = {
  cost: number;
  signedIn: boolean;
  balance: number;
  premium: boolean;
  admin: boolean;
  /** Kredisiz açabilir mi (premium / yönetici). */
  free: boolean;
  /** Yalnız hazır analizde anlamlı. */
  weeklyFree: WeeklyFreeOffer;
};

export async function buildOffer(viewer: AnalysisViewer | null, now: number = Date.now()): Promise<AnalysisOffer> {
  if (!viewer) {
    return {
      cost: ANALYSIS_UNLOCK_COST,
      signedIn: false,
      balance: 0,
      premium: false,
      admin: false,
      free: false,
      weeklyFree: { available: false, reason: 'SIGNED_OUT' },
    };
  }
  const reason = weeklyFreeIneligibility(viewer, now);
  const used = reason ? false : await weeklyFreeUsed(viewer.id, now);
  return {
    cost: ANALYSIS_UNLOCK_COST,
    signedIn: true,
    balance: viewer.credits,
    premium: isPremiumUser(viewer, now),
    admin: isAdminUser(viewer),
    free: analysisIsFree(viewer, now),
    weeklyFree: { available: !reason && !used, reason: reason ?? (used ? 'USED' : null) },
  };
}
