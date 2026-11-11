/**
 * Gündem resmi hesapları — TEK KAYNAK (rozet, profil `official` bayrağı, `scope=official` akışı, bot yazarı).
 * Ana resmi hesap: `info@getscor3.com` (kullanıcı adı @scor3) — elle yazılan postlar. Bot taslakları türüne göre ROL hesaplarından
 * yayınlanır (`BOT_ROLE_ACCOUNTS`: Scor3 Canlı / Analiz / Maç Sonu; 2026-11-11 kararı: akış tek hesaptan akmasın). Rol hesapları da
 * resmidir (doğrulanmış rozeti). Eski e-postalar ve eski seed hesabı resmi statüden çıkarıldı (official.test.ts).
 *
 * Şema/migration gerektirmez: varsayılan liste + `OFFICIAL_ACCOUNT_EMAILS` env'i (virgülle ayrılmış e-postalar).
 * Kural (`isOfficialUser`): e-posta listede VEYA post `OFFICIAL_BOT` (legacy bot satırı; prod'da yok). E-posta hiçbir
 * yanıta yazılmaz; yalnızca sunucuda bu karşılaştırma için okunur.
 */
export const DEFAULT_BOT_ACCOUNT_EMAIL = 'info@getscor3.com';

/** Bot taslak türü → yayınlayan rol hesabı. Hesap yoksa ilk yayında oluşturulur (şifresiz → girişle kullanılamaz; botPost.ts). */
export type BotRole = 'GOAL' | 'PREVIEW' | 'RECAP';
/** Rol hesaplarının profil görseli: marka ikonu (resmi hesapla aynı). */
export const BOT_ROLE_IMAGE = '/brand/icon-192.png';
export type BotRoleAccount = { email: string; username: string; name: string };
export const BOT_ROLE_ACCOUNTS: Record<BotRole, BotRoleAccount> = {
  GOAL: { email: 'bot-canli@getscor3.com', username: 'scor3canli', name: 'Scor3 Canlı' },
  PREVIEW: { email: 'bot-analiz@getscor3.com', username: 'scor3analiz', name: 'Scor3 Analiz' },
  RECAP: { email: 'bot-macsonu@getscor3.com', username: 'scor3macsonu', name: 'Scor3 Maç Sonu' },
};

export function isBotRole(v: unknown): v is BotRole {
  return v === 'GOAL' || v === 'PREVIEW' || v === 'RECAP';
}

export const DEFAULT_OFFICIAL_ACCOUNT_EMAILS: readonly string[] = [DEFAULT_BOT_ACCOUNT_EMAIL, ...Object.values(BOT_ROLE_ACCOUNTS).map((a) => a.email)];

export function getOfficialAccountEmails(): string[] {
  const extra = (process.env.OFFICIAL_ACCOUNT_EMAILS ?? '').split(',');
  return [...new Set([...DEFAULT_OFFICIAL_ACCOUNT_EMAILS, ...extra].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

/** Bot postlarının yazarı: `GUNDEM_BOT_EMAIL` env'i, yoksa tek resmi hesap. Kullanıcı satırı önceden var olmalı (hesap oluşturulmaz). */
export function getBotAccountEmail(): string {
  return (process.env.GUNDEM_BOT_EMAIL ?? '').trim().toLowerCase() || DEFAULT_BOT_ACCOUNT_EMAIL;
}

export function isOfficialUser(user: { email?: string | null } | null | undefined, authorType?: string | null): boolean {
  if (authorType === 'OFFICIAL_BOT') return true;
  const email = user?.email?.trim().toLowerCase();
  return !!email && getOfficialAccountEmails().includes(email);
}
