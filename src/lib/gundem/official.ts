/**
 * Gündem resmi hesabı — TEK KAYNAK (rozet, profil `official` bayrağı, `scope=official` akışı, bot yazarı).
 * Tek resmi hesap: "ofsaytyokmedia" (`bilgi.ofsaytyok@gmail.com`) — hem elle yazılan hem bot postlarının hesabı.
 * Eski seed hesabı (`official@ofsaytyok.invalid`, "ofsaytyok") resmi statüden çıkarıldı; hesap silinmedi.
 *
 * Şema/migration gerektirmez: varsayılan liste + `OFFICIAL_ACCOUNT_EMAILS` env'i (virgülle ayrılmış e-postalar).
 * Kural (`isOfficialUser`): e-posta listede VEYA post `OFFICIAL_BOT` (legacy bot satırı; prod'da yok). E-posta hiçbir
 * yanıta yazılmaz; yalnızca sunucuda bu karşılaştırma için okunur.
 */
export const DEFAULT_BOT_ACCOUNT_EMAIL = 'bilgi.ofsaytyok@gmail.com';

export const DEFAULT_OFFICIAL_ACCOUNT_EMAILS: readonly string[] = [DEFAULT_BOT_ACCOUNT_EMAIL];

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
