/**
 * Gündem resmi/bot hesabı. Tek bir "Ofsayt Yok" User satırı (password: null → giriş yapılamaz).
 * E-posta `.invalid` alan adında: gerçek bir posta kutusu olmadığından şifre sıfırlama ile ele geçirilemez.
 * Satır `scripts/seed-official-account.mjs` ile oluşturulur.
 */
export const OFFICIAL_ACCOUNT_EMAIL = 'official@ofsaytyok.invalid';
export const OFFICIAL_ACCOUNT_USERNAME = 'ofsaytyok';
export const OFFICIAL_ACCOUNT_NAME = 'Ofsayt Yok';

/**
 * "Resmi" sayılan hesaplar — TEK KAYNAK (rozet, profil `official` bayrağı, `scope=official` akışı). Şema/migration gerektirmez:
 * varsayılan liste + `OFFICIAL_ACCOUNT_EMAILS` env'i (virgülle ayrılmış e-postalar). Kural (`isOfficialUser`): e-posta listede VEYA
 * post `OFFICIAL_BOT` (legacy bot satırı). E-posta hiçbir yanıta yazılmaz; yalnızca sunucuda bu karşılaştırma için okunur.
 */
export const DEFAULT_OFFICIAL_ACCOUNT_EMAILS: readonly string[] = [OFFICIAL_ACCOUNT_EMAIL, 'bilgi.ofsaytyok@gmail.com'];

export function getOfficialAccountEmails(): string[] {
  const extra = (process.env.OFFICIAL_ACCOUNT_EMAILS ?? '').split(',');
  return [...new Set([...DEFAULT_OFFICIAL_ACCOUNT_EMAILS, ...extra].map((e) => e.trim().toLowerCase()).filter(Boolean))];
}

export function isOfficialUser(user: { email?: string | null } | null | undefined, authorType?: string | null): boolean {
  if (authorType === 'OFFICIAL_BOT') return true;
  const email = user?.email?.trim().toLowerCase();
  return !!email && getOfficialAccountEmails().includes(email);
}
