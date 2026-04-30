/**
 * Premium üyelik helper'ları.
 * Kullanıcı ya `role: ADMIN` ise ya da `premiumUntil > now` ise premium sayılır.
 */
import type { Role } from '@prisma/client';

export type PremiumCheckInput = {
  role?: Role | null;
  premiumUntil?: Date | string | null;
};

export function isUserPremium(user: PremiumCheckInput | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (!user.premiumUntil) return false;
  const until =
    typeof user.premiumUntil === 'string'
      ? new Date(user.premiumUntil)
      : user.premiumUntil;
  if (Number.isNaN(until.getTime())) return false;
  return until.getTime() > Date.now();
}
