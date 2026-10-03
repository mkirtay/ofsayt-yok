/**
 * Arkadaş daveti (kredi modeli v2) — ALTYAPI. Ödül: davet edilenin İLK SATIN ALIMINDA iki tarafa 2'şer kredi.
 * Ödeme entegrasyonu yok → `grantReferralRewardOnFirstPurchase` HİÇBİR YERDEN ÇAĞRILMAZ (testle korunur); ödeme
 * webhook'unda ilk başarılı satın almaya bağlanacak. Kredi asla maç sonucuna bağlı değil (karar 8).
 *
 * Suistimal: ödül yalnız satın almayla (gerçek para); davet edilen başına bir kez (Referral.refereeId tekil + defter
 * anahtarları); kendine davet yok; davet edenin ödülü takvim ayı başına en çok `REFERRER_MONTHLY_CAP` (davet edilen
 * yine alır). Ödeme tarafında kart / IP eşleşmesi kontrolü entegrasyonda eklenecek.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/credits';

export const REFERRAL_BONUS_CREDITS = 2;
export const REFERRER_MONTHLY_CAP = 20;
/** Karışabilecek karakterler yok (0/O, 1/I/L). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export function generateReferralCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

/** Kullanıcının davet kodu; yoksa üretir (çakışmada yeniden dener). */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) throw new Error('Kullanıcı bulunamadı');
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    try {
      const { count } = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (count === 1) return code;
      const again = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
      if (again?.referralCode) return again.referralCode; // eşzamanlı başka istek yazdı
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // kod çakıştı → yeni kod
    }
  }
  throw new Error('Davet kodu üretilemedi');
}

/**
 * Kayıtta davet kaydı (en iyi çaba; kayıt akışını bozmaz). Kod geçersiz / bulunamadı / kendine davet → false.
 * Davet edilen başına bir kez (`refereeId` tekil).
 */
export async function recordReferral(refereeId: string, rawCode: unknown): Promise<boolean> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return false;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === refereeId) return false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.referral.create({ data: { referrerId: referrer.id, refereeId } });
      await tx.user.update({ where: { id: refereeId }, data: { referredById: referrer.id } });
    });
    return true;
  } catch (e) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}

async function grant(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], userId: string, key: string, note: string) {
  const user = await tx.user.update({
    where: { id: userId },
    data: { credits: { increment: REFERRAL_BONUS_CREDITS } },
    select: { credits: true },
  });
  await tx.creditTransaction.create({
    data: { userId, type: 'REFERRAL_BONUS', amount: REFERRAL_BONUS_CREDITS, balanceAfter: user.credits, idempotencyKey: key, note },
  });
}

/**
 * ÖDEME ENTEGRASYONUNDA bağlanacak: davet edilenin ilk başarılı satın alımından sonra çağrılır. Bir kez (rewardedAt +
 * defter anahtarları `referral:{refereeId}:referee|referrer`). Davet edenin bu ayki ödül sayısı tavandaysa yalnız
 * davet edilen alır.
 * @returns { referee, referrer } kimin kredi aldığı; davet yoksa / ödüllendirilmişse null
 */
export async function grantReferralRewardOnFirstPurchase(
  refereeId: string,
  now: number = Date.now(),
): Promise<{ referee: boolean; referrer: boolean } | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const ref = await tx.referral.findUnique({ where: { refereeId } });
      if (!ref || ref.rewardedAt) return null;
      const { count } = await tx.referral.updateMany({ where: { id: ref.id, rewardedAt: null }, data: { rewardedAt: new Date(now) } });
      if (count === 0) return null;
      const d = new Date(now);
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const rewardedThisMonth = await tx.referral.count({
        where: { referrerId: ref.referrerId, rewardedAt: { gte: monthStart } },
      });
      await grant(tx, refereeId, `referral:${refereeId}:referee`, 'Davet ödülü (ilk satın alma)');
      const referrerRewarded = rewardedThisMonth <= REFERRER_MONTHLY_CAP; // bu ödül dahil sayıldı
      if (referrerRewarded) await grant(tx, ref.referrerId, `referral:${refereeId}:referrer`, 'Davet ödülü (davet edilen satın aldı)');
      return { referee: true, referrer: referrerRewarded };
    });
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}
