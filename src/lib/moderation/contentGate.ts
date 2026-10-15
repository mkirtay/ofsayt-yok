/**
 * Gündem yazma kapısı (gönderi / yorum) ve profil alanı denetimi. Sırayla:
 *  1. Sözlük: AĞIR → 400 CONTENT_REJECTED (hangi kelime olduğu söylenmez), ORTA → yayın + kuyruk işareti.
 *  2. Bağlantı: yeni hesap (NEW_ACCOUNT_DAYS) en fazla NEW_ACCOUNT_MAX_LINKS → aşarsa 400 LINK_LIMIT; eski hesapta
 *     LINK_FLAG_ABOVE üstü → işaret.
 *  3. Tekrar: aynı kullanıcı aynı metni DUPLICATE_BLOCK_WINDOW_MS içinde → 409 DUPLICATE_CONTENT; 24 sa içinde → işaret.
 * Reddedilenler kişisel veri tutmadan sayılır (ModerationStat). Mevcut hız sınırları (5 / dk) uçta, bundan önce.
 */
import { prisma } from '@/lib/prisma';
import {
  DUPLICATE_BLOCK_WINDOW_MS,
  DUPLICATE_FLAG_WINDOW_MS,
  LINK_FLAG_ABOVE,
  NEW_ACCOUNT_DAYS,
  NEW_ACCOUNT_MAX_LINKS,
} from '@/config/moderation';
import { analyzeText, countLinks, duplicateFingerprint } from './textFilter';
import { getDictionary } from './terms';
import { recordModerationStat, type StatSurface } from './stats';

export const CONTENT_REJECTED_CODE = 'CONTENT_REJECTED';
export const CONTENT_REJECTED_MESSAGE =
  'Paylaşımın topluluk kurallarımıza uymayan ifadeler içeriyor. Lütfen düzenleyip tekrar dene.';
export const LINK_LIMIT_CODE = 'LINK_LIMIT';
export const DUPLICATE_CONTENT_CODE = 'DUPLICATE_CONTENT';
export const DUPLICATE_CONTENT_MESSAGE = 'Bu içeriği kısa süre önce paylaştın. Aynı metni tekrar gönderemezsin.';
export const PROFILE_REJECTED_MESSAGE = 'Bu alan topluluk kurallarımıza uymayan ifadeler içeriyor. Lütfen değiştir.';

const DAY_MS = 24 * 60 * 60_000;
/** Farklı gönderilerde kısa genel yorumlar ("haklısın") tekrar sayılmasın: hedefler arası tekrar için en az uzunluk. */
const CROSS_TARGET_MIN_FINGERPRINT = 15;

export type GateRejection = { ok: false; status: number; code: string; error: string };
export type GateResult = { ok: true; flags: string[] } | GateRejection;

type GateInput = {
  userId: string;
  body: string;
  surface: 'post' | 'comment';
  accountCreatedAt: Date;
  /** Yorumda: yorumun yapıldığı gönderi (aynı gönderide kısa tekrar da sayılır). */
  postId?: string;
  now?: Date;
};

async function recentBodies(input: GateInput, since: Date) {
  if (input.surface === 'post') {
    const rows = await prisma.post.findMany({
      where: { authorId: input.userId, createdAt: { gte: since }, deletedAt: null },
      select: { body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({ ...r, samePost: false }));
  }
  const rows = await prisma.postComment.findMany({
    where: { userId: input.userId, createdAt: { gte: since }, deletedAt: null },
    select: { body: true, createdAt: true, postId: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({ body: r.body, createdAt: r.createdAt, samePost: r.postId === input.postId }));
}

export async function moderateGundemText(input: GateInput): Promise<GateResult> {
  const now = input.now ?? new Date();
  const surface: StatSurface = input.surface;
  const flags = new Set<string>();

  const verdict = analyzeText(input.body, await getDictionary());
  if (verdict.level === 'block') {
    await recordModerationStat(surface, verdict.categories, 'rejected', now);
    return { ok: false, status: 400, code: CONTENT_REJECTED_CODE, error: CONTENT_REJECTED_MESSAGE };
  }
  if (verdict.level === 'flag') for (const c of verdict.categories) flags.add(`AUTO_${c.toUpperCase()}`);

  const links = countLinks(input.body);
  const isNew = now.getTime() - input.accountCreatedAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS;
  if (isNew && links > NEW_ACCOUNT_MAX_LINKS) {
    await recordModerationStat(surface, ['spam_links'], 'rejected', now);
    return {
      ok: false,
      status: 400,
      code: LINK_LIMIT_CODE,
      error: `Yeni hesaplar bir paylaşımda en fazla ${NEW_ACCOUNT_MAX_LINKS} bağlantı ekleyebilir.`,
    };
  }
  if (links > LINK_FLAG_ABOVE) flags.add('AUTO_SPAM_LINKS');

  const fp = duplicateFingerprint(input.body);
  if (fp) {
    const recent = await recentBodies(input, new Date(now.getTime() - DUPLICATE_FLAG_WINDOW_MS));
    const same = recent.filter(
      (r) => (r.samePost || fp.length >= CROSS_TARGET_MIN_FINGERPRINT || input.surface === 'post') && duplicateFingerprint(r.body) === fp,
    );
    if (same.some((r) => now.getTime() - r.createdAt.getTime() < DUPLICATE_BLOCK_WINDOW_MS)) {
      await recordModerationStat(surface, ['duplicate'], 'rejected', now);
      return { ok: false, status: 409, code: DUPLICATE_CONTENT_CODE, error: DUPLICATE_CONTENT_MESSAGE };
    }
    if (same.length) flags.add('AUTO_DUPLICATE');
  }
  return { ok: true, flags: [...flags] };
}

/** Profil metni (ad, kullanıcı adı, bio): yalnız AĞIR reddedilir (profilin kuyruğu yok; kullanıcı şikâyeti var). */
export async function isProfileTextAllowed(value: string, now = new Date()): Promise<boolean> {
  // Kullanıcı adındaki alt çizgi kelime ayırıcısı ("orospu_cocugu").
  const verdict = analyzeText(value.replace(/_/g, ' '), await getDictionary());
  if (verdict.level !== 'block') return true;
  await recordModerationStat('profile', verdict.categories, 'rejected', now);
  return false;
}
