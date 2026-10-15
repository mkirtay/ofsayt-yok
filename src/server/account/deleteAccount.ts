/**
 * Kullanıcının kendi hesabını silmesi (App Store 5.1.1(v), KVKK md. 7/11). Web profil ayarları ve mobil aynı uca gelir:
 * `DELETE /api/user/me` (bkz. pages/api/user/me.ts). Veri envanteri ve kararlar: docs/HESAP_SILME_VE_ONAY.md.
 *
 * Tek transaction:
 *  1. "Silinmiş kullanıcı" yer tutucusu (config/deletedUser.ts) yoksa oluşturulur.
 *  2. Gündem gönderileri, gönderi yorumları ve eski maç yorumları yer tutucuya devredilir (içerik kalır, kişi kopar).
 *  3. Sipariş kayıtları (PaymentOrder) yer tutucuya devredilir: tutar / paket / durum / tarih / Hikie kimliği kalır,
 *     kullanıcıyla bağlantı kopar. Saklama süresi avukata soruldu (docs/YASAL_NOTLAR.md).
 *  3b. Gündem moderasyonu: kullanıcının verdiği şikâyetler anonimleşir (reporterId boş — kuyruk kaybolmaz), hakkındaki
 *     şikâyetlerin targetUserId'si boşalır (içerik yer tutucuya geçti; şikâyet içerik kimliğiyle kalır), engelleri (iki
 *     yön) ve etiketlendiği satırlar silinir (metin düz "@ad" kalır), yönetici kaydındaki hedef kimliği boşalır.
 *  4. Davet kayıtları silinir, bu kullanıcının davet ettiklerindeki `referredById` boşaltılır, e-posta doğrulama /
 *     şifre sıfırlama belirteçleri silinir.
 *  5. User satırı silinir → CASCADE: Account (Google bağlantısı), Session, beğeniler, takipler, bildirimler, push
 *     belirteçleri, kredi defteri, açılan analizler, premium kayıtları, anket oyları, Frikik skorları.
 *  6. PII'siz denetim kaydı (AccountDeletionLog: kanal, giriş yöntemi, hesap yaşı, sayılar).
 * Ardından oturum sürümü önbelleği silinir → web oturumu ve mobil belirteç bir sonraki istekte düşer (DB'de kullanıcı
 * yok). Onay e-postası en son ve en iyi çaba: gönderilemezse silme geri alınmaz.
 */
import { prisma } from '@/lib/prisma';
import { invalidateSessionVersion } from '@/lib/sessionVersion';
import { sendAccountDeletedEmail } from '@/lib/security';
import { isOfficialUser } from '@/lib/gundem/official';
import { isDeletionConfirmed } from '@/lib/accountDeletion';
import { DELETED_USER_EMAIL, DELETED_USER_ID, DELETED_USER_NAME, isDeletedUserId } from '@/config/deletedUser';

export type DeletionSource = 'web' | 'mobile';

export type DeletionCounts = {
  postsAnonymized: number;
  postCommentsAnonymized: number;
  matchCommentsAnonymized: number;
  paymentOrdersDetached: number;
  referralsDeleted: number;
  verificationTokensDeleted: number;
  reportsAnonymized: number;
  blocksDeleted: number;
  mentionsDeleted: number;
};

export type DeleteAccountResult =
  | { ok: true; counts: DeletionCounts; emailSent: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'CONFIRM_MISMATCH' | 'PROTECTED_ACCOUNT' };

const DAY_MS = 24 * 60 * 60 * 1000;

export async function deleteOwnAccount(
  userId: string,
  opts: { confirm: unknown; source: DeletionSource; sendEmail?: (email: string) => Promise<boolean> },
): Promise<DeleteAccountResult> {
  if (isDeletedUserId(userId)) return { ok: false, reason: 'PROTECTED_ACCOUNT' };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, password: true, role: true, createdAt: true, accounts: { select: { provider: true } } },
  });
  if (!user) return { ok: false, reason: 'NOT_FOUND' };
  if (!isDeletionConfirmed(opts.confirm, user.email)) return { ok: false, reason: 'CONFIRM_MISMATCH' };
  // Yönetici ve resmi Gündem hesabı (bot yazarı) buradan silinmez: bot akışı ve yönetim paneli bu satırlara dayanır.
  if (user.role === 'ADMIN' || isOfficialUser({ email: user.email })) return { ok: false, reason: 'PROTECTED_ACCOUNT' };

  const email = user.email;
  const counts = await prisma.$transaction(
    async (tx) => {
      await tx.user.upsert({
        where: { id: DELETED_USER_ID },
        update: {},
        create: { id: DELETED_USER_ID, email: DELETED_USER_EMAIL, name: DELETED_USER_NAME, credits: 0 },
      });
      const posts = await tx.post.updateMany({ where: { authorId: userId }, data: { authorId: DELETED_USER_ID } });
      const postComments = await tx.postComment.updateMany({ where: { userId }, data: { userId: DELETED_USER_ID } });
      const matchComments = await tx.matchComment.updateMany({ where: { userId }, data: { userId: DELETED_USER_ID } });
      const reports = await tx.contentReport.updateMany({ where: { reporterId: userId }, data: { reporterId: null } });
      await tx.contentReport.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } });
      const blocks = await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      const mentions = await tx.gundemMention.deleteMany({ where: { mentionedUserId: userId } });
      await tx.moderationAction.updateMany({ where: { targetUserId: userId }, data: { targetUserId: null } });
      const orders = await tx.paymentOrder.updateMany({ where: { userId }, data: { userId: DELETED_USER_ID } });
      const referrals = await tx.referral.deleteMany({ where: { OR: [{ refereeId: userId }, { referrerId: userId }] } });
      await tx.user.updateMany({ where: { referredById: userId }, data: { referredById: null } });
      const tokens = await tx.verificationToken.deleteMany({
        where: { identifier: { in: [email, `reset:${email}`] } },
      });
      await tx.user.delete({ where: { id: userId } });
      const c: DeletionCounts = {
        postsAnonymized: posts.count,
        postCommentsAnonymized: postComments.count,
        matchCommentsAnonymized: matchComments.count,
        paymentOrdersDetached: orders.count,
        referralsDeleted: referrals.count,
        verificationTokensDeleted: tokens.count,
        reportsAnonymized: reports.count,
        blocksDeleted: blocks.count,
        mentionsDeleted: mentions.count,
      };
      await tx.accountDeletionLog.create({
        data: {
          source: opts.source,
          hadPassword: user.password != null,
          oauthProviders: [...new Set(user.accounts.map((a) => a.provider))].sort(),
          accountAgeDays: Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / DAY_MS)),
          counts: c,
        },
      });
      return c;
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  await invalidateSessionVersion(userId); // önbellekteki sürüm hemen düşsün → oturum / belirteç geçersiz
  const emailSent = await (opts.sendEmail ?? sendAccountDeletedEmail)(email);
  return { ok: true, counts, emailSent };
}
