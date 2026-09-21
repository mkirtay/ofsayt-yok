import { prisma } from '@/lib/prisma';
import { sanitizePlainText } from '@/lib/security';
import { POST_MAX_LENGTH } from '@/config/gundem';
import { getBotAccountEmail } from '@/lib/gundem/official';
import { postSelect, serializePost } from '@/lib/gundem/posts';

export type CreateBotPostInput = {
  body: string;
  /** Tekrar üretimi engeller (örn. `goal:<fixtureId>:<eventId>`); aynı anahtar → mevcut kayıt, hata değil. */
  externalKey?: string | null;
  matchId?: string | null;
  teamId?: number | null;
};

export type CreateBotPostResult =
  | { status: 'created' | 'exists'; post: ReturnType<typeof serializePost> }
  | { status: 'invalid-body' }
  | { status: 'no-account'; email: string };

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
    if (existing) return { status: 'exists', post: serializePost(existing) };
  }

  const email = getBotAccountEmail();
  const account = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!account) return { status: 'no-account', email };

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
    return { status: 'created', post: serializePost(created) };
  } catch (e) {
    // Yarış: aynı externalKey eşzamanlı yazıldıysa unique ihlali → mevcut kaydı döndür.
    if (externalKey && (e as { code?: string }).code === 'P2002') {
      const existing = await prisma.post.findUnique({ where: { externalKey }, select });
      if (existing) return { status: 'exists', post: serializePost(existing) };
    }
    throw e;
  }
}
