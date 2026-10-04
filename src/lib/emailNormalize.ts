/**
 * Kanonik e-posta: aynı posta kutusuna giden adresleri tek biçime indirir (çoklu hesap / kayıt bonusu suistimali).
 * Gmail (`gmail.com`, `googlemail.com`): yerel kısımda `+etiket` ve noktalar yok sayılır, alan `gmail.com`.
 * Diğer sağlayıcılar yalnız küçük harf + boşluk kırpma (`+` her sağlayıcıda etiket değildir).
 */
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!GMAIL_DOMAINS.has(domain)) return e;
  const base = local.split('+')[0]!.replace(/\./g, '');
  return `${base || local}@gmail.com`;
}
