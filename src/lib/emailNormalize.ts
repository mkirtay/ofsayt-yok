/**
 * Kanonik e-posta: aynı posta kutusuna giden adresleri tek biçime indirir (çoklu hesap / kayıt bonusu suistimali).
 * `User.emailNormalized` (tekil) bu değeri tutar; eski satırlar `scripts/backfill-email-normalized.mjs` ile yenilenir.
 *
 * Kurallar:
 * - Boşluk kırpılır, küçük harfe çevrilir; alan adındaki baştaki/sondaki noktalar atılır (`a@gmail.com.` = `a@gmail.com`).
 * - ASCII olmayan alan adı IDNA/punycode biçimine çevrilir (`new URL` — Node ve tarayıcıda aynı). Böylece tam genişlik
 *   eşdeğerleri (`ｇｍａｉｌ.ｃｏｍ`) tek biçime iner; Unicode benzer harfli sahte alanlar (`gmaıl.com`) ise `xn--…` olur
 *   ve Gmail kuralları onlara uygulanmaz. Çevrilemeyen alan adı küçük harfli hâliyle kalır (istisna fırlatmaz).
 * - TÜM alan adlarında `+etiket` atılır (yerel kısım ilk `+`'dan önce). Gmail, Outlook/Hotmail/Live, iCloud, Proton,
 *   Yandex, Fastmail, Zoho… `+` alt adreslemeyi destekler; desteklemeyen nadir sağlayıcıda en kötü sonuç aynı kişinin
 *   ikinci hesap açamamasıdır (bonus suistimaline göre kabul edilebilir yanlış pozitif). Yerel kısım `+` ile başlıyorsa
 *   (etiketten önce bir şey yoksa) dokunulmaz.
 * - Yalnız Gmail (`gmail.com`, `googlemail.com`): noktalar da yok sayılır, alan `gmail.com`. Diğer sağlayıcılarda nokta
 *   anlamlıdır (Outlook'ta `a.b` ≠ `ab`).
 * - Yahoo'nun `-` "disposable address" takma adları ATILMAZ: Yahoo'da `-` sıradan bir yerel kısım karakteridir de
 *   (`ali-veli@yahoo.com` gerçek ve ayrı bir hesap olabilir) ve takma adın taban adı adresin içinden güvenle
 *   çıkarılamaz → kesmek, farklı kişileri tek posta kutusu sayan yanlış pozitif üretir.
 * - Tırnaklı yerel kısım (`"a+b"@x`) olduğu gibi bırakılır (orada `+` etiket değildir).
 */
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

function asciiDomain(raw: string): string {
  const d = raw.trim().replace(/^\.+|\.+$/g, '');
  if (!d || /^[a-z0-9.-]+$/.test(d)) return d;
  // Ayırıcı içeren girdi URL ayrıştırıcısında başka bir ana makineye dönüşebilir → çevirmeden bırak.
  if (/[/@:?#\\%\s]/.test(d)) return d;
  try {
    const host = new URL(`http://${d}/`).hostname.replace(/^\.+|\.+$/g, '');
    return host || d;
  } catch {
    return d;
  }
}

export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at <= 0) return e;
  const local = e.slice(0, at).trim();
  let domain = asciiDomain(e.slice(at + 1));
  if (!local || !domain) return e;
  if (local.startsWith('"')) return `${local}@${domain}`;

  const plus = local.indexOf('+');
  let base = plus > 0 ? local.slice(0, plus) : local;
  if (GMAIL_DOMAINS.has(domain)) {
    domain = 'gmail.com';
    base = base.replace(/\./g, '') || base;
  }
  return `${base}@${domain}`;
}

/**
 * Aynı posta kutusunu (kanonik e-posta) paylaşan kullanıcıları bulan Prisma `where` dalları (`OR` içine).
 * `emailNormalized` henüz geri doldurulmamış / eski kuralla yazılmış satırları da yakalamak için ham `email` üzerinde
 * tam eşleşme ve `+etiket` varyantı (`taban+…@alan`) da aranır. Gmail nokta varyantları ham e-postada aranamaz — onlar
 * eski kuralda da kanonikleşiyordu; `emailNormalized`'ı boş eski satırlar backfill betiğiyle dolar.
 */
export function sameMailboxWhere(canonical: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [{ emailNormalized: canonical }, { email: canonical }];
  const at = canonical.lastIndexOf('@');
  if (at > 0 && !canonical.startsWith('"')) {
    const local = canonical.slice(0, at);
    const domain = canonical.slice(at + 1);
    out.push({ email: { startsWith: `${local}+`, endsWith: `@${domain}` } });
    if (domain === 'gmail.com') out.push({ email: { startsWith: `${local}+`, endsWith: '@googlemail.com' } });
  }
  return out;
}
