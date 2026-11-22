/**
 * Haftalık e-posta özeti (büyüme raporu 3.3): açık izin veren (EmailDigestSubscription), e-postası doğrulanmış ve favori
 * takımı olan kullanıcılara haftada bir — favori takımlarının önümüzdeki 7 günkü maçları + son 7 gün AI isabeti +
 * tahmin oyunu bağlantısı. Her e-postada imzalı tek tık abonelikten çıkma bağlantısı.
 *
 * VARSAYILAN KAPALI: EMAIL_DIGEST_ENABLED=true (ticari elektronik ileti → İYS kaydı ve hukuki kontrol sonrası), arayüz
 * NEXT_PUBLIC_EMAIL_DIGEST_ENABLED=true. Tetikleyici: harici cron (Pazartesi sabahı) → /api/cron/weekly-digest.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { BRAND, GAME_BRAND } from '@/config/brand';
import { siteBaseUrl } from '@/lib/siteUrl';
import { emailHtml, sendTransactionalEmail, type EmailContent } from '@/lib/security';
import { buildMatchHref } from '@/utils/matchUrl';
import type { Match } from '@/models/liveScore';

export const MAX_PER_RUN = 500;

export function digestEnabled(): boolean {
  return process.env.EMAIL_DIGEST_ENABLED === 'true';
}

const secret = () => process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? '';

/** Abonelikten çıkma imzası (kullanıcı kimliğine bağlı; süresiz, yalnız çıkış yapar). */
export function unsubscribeSignature(userId: string): string {
  return createHmac('sha256', secret()).update(`digest-unsub:${userId}`).digest('base64url');
}

export function verifyUnsubscribe(userId: string, sig: string): boolean {
  if (!secret() || !userId || !sig) return false;
  const a = Buffer.from(unsubscribeSignature(userId));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(userId: string): string {
  return `${siteBaseUrl()}/api/digest/unsubscribe?u=${encodeURIComponent(userId)}&s=${unsubscribeSignature(userId)}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type DigestMatch = { title: string; when: string; url: string };
export type DigestProof = { hits: number; picks: number; days: number } | null;

/** Saf: e-posta içeriği (konu + HTML + düz metin). Bahis dili yok; "bilgi amaçlı, 18+" notu. */
export function buildDigestEmail(opts: { name: string | null; matches: DigestMatch[]; proof: DigestProof; unsubscribe: string }): EmailContent {
  const base = siteBaseUrl();
  const hello = opts.name ? `Merhaba ${opts.name},` : 'Merhaba,';
  const list = opts.matches.length
    ? opts.matches.map((m) => `<li><a href="${esc(m.url)}">${esc(m.title)}</a> — ${esc(m.when)}</li>`).join('')
    : '<li>Bu hafta favori takımlarının maçı görünmüyor.</li>';
  const proofLine = opts.proof
    ? `Son ${opts.proof.days} günde öne çıkan ${opts.proof.picks} AI tahmininden ${opts.proof.hits} tanesi tuttu. <a href="${base}/ai-istatistikleri">İsabet istatistikleri</a>`
    : `<a href="${base}/ai-istatistikleri">AI isabet istatistikleri</a>`;
  const html = emailHtml(
    `<p>${esc(hello)}</p>
<p>Favori takımlarının bu haftaki maçları:</p>
<ul>${list}</ul>
<p>${proofLine}</p>
<p><a href="${base}${GAME_BRAND.basePath}">${GAME_BRAND.name}: bu haftanın maçlarını tahmin et →</a></p>
<p style="color:#666;font-size:12px">Bilgi amaçlıdır; kesin sonuç vaat etmez. 18+. Bu e-postayı haftalık özet iznin olduğu için aldın.
<a href="${esc(opts.unsubscribe)}">Abonelikten çık</a></p>`,
  );
  const text = [
    hello,
    '',
    'Favori takımlarının bu haftaki maçları:',
    ...(opts.matches.length ? opts.matches.map((m) => `- ${m.title} — ${m.when}: ${m.url}`) : ['- Bu hafta favori takımlarının maçı görünmüyor.']),
    '',
    opts.proof ? `Son ${opts.proof.days} günde öne çıkan ${opts.proof.picks} AI tahmininden ${opts.proof.hits} tanesi tuttu: ${base}/ai-istatistikleri` : `${base}/ai-istatistikleri`,
    `${GAME_BRAND.name}: ${base}${GAME_BRAND.basePath}`,
    '',
    `Bilgi amaçlıdır; kesin sonuç vaat etmez. 18+. Abonelikten çık: ${opts.unsubscribe}`,
  ].join('\n');
  return { subject: `${BRAND.name} haftalık özet: favori takımlarının maçları`, html, text };
}

const whenFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long', day: 'numeric', month: 'long' });

/** Önümüzdeki 7 günün maçlarından kullanıcının favori takımlarınınkiler (tarih sırasıyla, en çok 10). */
export function pickDigestMatches(fixtures: readonly Match[], favorites: ReadonlySet<number>): DigestMatch[] {
  const base = siteBaseUrl();
  return fixtures
    .filter((m) => favorites.has(Number(m.home?.id ?? m.home_id)) || favorites.has(Number(m.away?.id ?? m.away_id)))
    .slice(0, 10)
    .map((m) => ({
      title: `${m.home.name} - ${m.away.name}`,
      when: `${m.date ? whenFmt.format(new Date(`${m.date}T12:00:00Z`)) : ''}${m.scheduled ? ` ${m.scheduled}` : ''}`.trim(),
      url: `${base}${buildMatchHref({ id: m.id, home: { name: m.home.name }, away: { name: m.away.name } })}`,
    }));
}

export async function runWeeklyDigest(now: number = Date.now()): Promise<{ skipped?: string; recipients?: number; sent?: number }> {
  if (!digestEnabled()) return { skipped: 'disabled' };
  const subs = await prisma.emailDigestSubscription.findMany({
    take: MAX_PER_RUN,
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { id: true, email: true, name: true, emailVerified: true, favoriteTeamIds: true } } },
  });
  const users = subs.map((s) => s.user).filter((u) => u.email && u.emailVerified && u.favoriteTeamIds.length > 0);
  if (!users.length) return { skipped: 'no-recipients', recipients: 0 };

  const { getFixturesByDate } = await import('@/services/liveScoreService');
  const days = Array.from({ length: 7 }, (_, i) => new Date(now + i * 86_400_000).toISOString().slice(0, 10));
  const fixtures = (await Promise.all(days.map((d) => getFixturesByDate(d).catch(() => [] as Match[])))).flat();
  const { loadRecentProof } = await import('@/server/aiRecentProof');
  const proof = await loadRecentProof(now);

  let sent = 0;
  for (const u of users) {
    const matches = pickDigestMatches(fixtures, new Set(u.favoriteTeamIds));
    if (!matches.length) continue; // boş özet gönderilmez
    const ok = await sendTransactionalEmail(u.email!, buildDigestEmail({ name: u.name, matches, proof, unsubscribe: unsubscribeUrl(u.id) }));
    if (ok) sent += 1;
  }
  return { recipients: users.length, sent };
}

export async function setDigestOptIn(userId: string, optIn: boolean): Promise<void> {
  if (optIn) await prisma.emailDigestSubscription.upsert({ where: { userId }, create: { userId }, update: {} });
  else await prisma.emailDigestSubscription.deleteMany({ where: { userId } });
}

export async function digestOptedIn(userId: string): Promise<boolean> {
  return !!(await prisma.emailDigestSubscription.findUnique({ where: { userId }, select: { userId: true } }));
}
