import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { BOT_ROLE_ACCOUNTS, BOT_ROLE_IMAGE, getBotAccountEmail, type BotRole } from '@/lib/gundem/official';
import { postSelect, serializePosts } from '@/lib/gundem/posts';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { captureError } from '@/lib/logger';

export type CreateBotPostInput = {
  body: string;
  /** Tekrar üretimi engeller (örn. `goal:<fixtureId>:<eventId>`); aynı anahtar → mevcut kayıt, hata değil. */
  externalKey?: string | null;
  matchId?: string | null;
  teamId?: number | null;
  /** Taslak türü → rol hesabı (Scor3 Canlı / Analiz / Maç Sonu). Yoksa ana bot hesabı (`getBotAccountEmail`). */
  role?: BotRole | null;
};

export type CreateBotPostResult =
  | { status: 'created' | 'exists'; post: Awaited<ReturnType<typeof serializePosts>>[number] }
  | { status: 'invalid-body' }
  | { status: 'no-account'; email: string };

/**
 * Rol hesabı: yoksa oluşturulur (şifresiz, e-posta doğrulanmış sayılır → resmi rozet; girişle kullanılamaz). Kullanıcı adı başka
 * birinde ise oluşturulamaz → `null` (çağıran ana bot hesabına düşer; yayın engellenmez).
 */
async function roleAccount(role: BotRole): Promise<{ id: string } | null> {
  const a = BOT_ROLE_ACCOUNTS[role];
  const existing = await prisma.user.findUnique({ where: { email: a.email }, select: { id: true } });
  if (existing) return existing;
  try {
    const now = new Date();
    return await prisma.user.create({
      data: { email: a.email, username: a.username, name: a.name, image: BOT_ROLE_IMAGE, emailVerified: now, termsAcceptedAt: now, credits: 0 },
      select: { id: true },
    });
  } catch (e) {
    captureError('gundem:bot-role-account', e);
    return prisma.user.findUnique({ where: { email: a.email }, select: { id: true } });
  }
}

/**
 * Resmi/bot hesabı (`getBotAccountEmail()`) adına `OFFICIAL_BOT` gönderisi oluşturur — TEK yol: HTTP uçları
 * (bot-post) ve ileride onay kuyruğu (Adım 3) bunu çağırır. Rate limit yok (yalnızca sunucu içi/yetkili çağrılar).
 * Metin `sanitizePlainText` + uzunluk kontrolünden geçer; `externalKey` idempotent (yarışta P2002 → mevcut kayıt).
 */
export async function createBotPost(input: CreateBotPostInput): Promise<CreateBotPostResult> {
  const body = sanitizePlainText(input.body, { allowNewlines: true });
  if (!body || body.length > POST_MAX_LENGTH) return { status: 'invalid-body' };

  const externalKey = input.externalKey ?? null;
  const select = postSelect(null);
  if (externalKey) {
    const existing = await prisma.post.findUnique({ where: { externalKey }, select });
    if (existing) return { status: 'exists', post: (await serializePosts([existing]))[0] };
  }

  // Rozet verisi: snapshot yoksa oluşturulur. Sağlayıcı hatası bot postunu ENGELLEMEZ (rozet sonra, ilk kullanıcı postunda da oluşur).
  if (input.matchId) {
    await ensureMatchSnapshot(input.matchId).catch((e) => captureError('gundem:bot-post-snapshot', e));
  }

  const account = (input.role ? await roleAccount(input.role) : null) ?? (await prisma.user.findUnique({ where: { email: getBotAccountEmail() }, select: { id: true } }));
  if (!account) return { status: 'no-account', email: getBotAccountEmail() };

  try {
    const created = await prisma.post.create({
      data: {
        authorId: account.id,
        authorType: 'OFFICIAL_BOT',
        body,
        externalKey,
        matchId: input.matchId ?? null,
        teamId: input.teamId ?? null,
      },
      select,
    });
    return { status: 'created', post: (await serializePosts([created]))[0] };
  } catch (e) {
    // Yarış: aynı externalKey eşzamanlı yazıldıysa unique ihlali → mevcut kaydı döndür.
    if (externalKey && (e as { code?: string }).code === 'P2002') {
      const existing = await prisma.post.findUnique({ where: { externalKey }, select });
      if (existing) return { status: 'exists', post: (await serializePosts([existing]))[0] };
    }
    throw e;
  }
}
