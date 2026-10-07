/**
 * Tek kullanımlık (geçici) e-posta alan adı kontrolü — şifreli kayıtta reddedilir (kayıt bonusu ve haftalık ücretsiz açma
 * suistimaline karşı; kredi modeli v2). Google hesapları bu kontrolden geçmez (e-posta Google'da doğrulanmış).
 *
 * Liste: config/disposableEmailDomains.generated.ts (github.com/disposable-email-domains/disposable-email-domains,
 * CC0 1.0; `scripts/update-disposable-email-domains.mjs` ile yenilenir) + aşağıdaki küçük EK liste.
 *
 * Alt alan adları da yakalanır (`x.mailinator.com`, `a.b.mailinator.com`). Arama doğrusaldır: ana makinedeki her
 * noktadan sonraki son ek bir kez `Set`'te aranır (alt dizi paylaşımı; yeniden `join` yok). Saldırgan kontrollü çok
 * parçalı ana makinede iş sınırlı kalsın diye yalnız son `MAX_LABELS` etiket denenir — listedeki en uzun kayıt bundan
 * kısadır, daha derin alt alan adları da en sağdaki `MAX_LABELS` etiketle eşleşir.
 */
import { DISPOSABLE_EMAIL_DOMAINS_TEXT } from '@/config/disposableEmailDomains.generated';

/**
 * Upstream listede (2026-10-03 sürümü) olmayan, herkese açık geçici posta servislerinin alan adları — elle derlendi
 * (servislerin kendi sitelerinde adres alanı olarak sundukları adlar). Takma ad/yönlendirme servisleri (duck.com,
 * SimpleLogin, addy.io, Firefox Relay) bilerek YOK: gerçek kullanıcıların kalıcı gizlilik adresleri; engellemek yanlış
 * pozitif üretir (ürün kararı açık).
 */
const EXTRA_DISPOSABLE_DOMAINS = [
  'temp-mail.io',
  'tempmail.dev',
  'tempmail.lol',
  'tempmail.so',
  'tempmail.net',
  'tempmail.website',
  'tempmailaddress.com',
  'tempmailbox.net',
  'tempinbox.xyz',
  'temp-mail.us',
  'tempm.com',
  'mail-temp.com',
  'disposablemail.com',
  'emailondeck.net',
  'etempmail.com',
  'luxusmail.org',
  'correotemporal.org',
  'mailgolem.com',
  'minutemail.co',
  'ethereal.email',
];

/** Listedeki en uzun kayıt 4 etiket (2026-10-03); pay bırakılarak 8. Yeni liste daha uzun kayıt getirirse test uyarır. */
export const MAX_LABELS = 8;
/** RFC 1035: ana makine adı en çok 253 karakter. Daha uzunu geçerli bir alıcı değildir; kontrol yine yapılır. */
const MAX_HOST_LENGTH = 253;

let domains: Set<string> | null = null;

function domainSet(): Set<string> {
  if (!domains) {
    domains = new Set(DISPOSABLE_EMAIL_DOMAINS_TEXT.split('\n'));
    for (const d of EXTRA_DISPOSABLE_DOMAINS) domains.add(d);
  }
  return domains;
}

export function isDisposableEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  // Sondaki nokta (FQDN) ve aşırı uzunluk: yalnız son MAX_HOST_LENGTH karakter yeterli (sağdan eşleşme).
  let host = e.slice(at + 1).trim().replace(/\.+$/, '');
  if (host.length > MAX_HOST_LENGTH) host = host.slice(host.length - MAX_HOST_LENGTH);
  if (!host) return false;
  const set = domainSet();

  // Sağdan sola: `c`, `b.c`, `a.b.c` … — her adım tek `lastIndexOf` + tek `slice`; toplam iş O(uzunluk × MAX_LABELS).
  let end = host.length;
  for (let labels = 0; labels < MAX_LABELS; labels++) {
    const dot = host.lastIndexOf('.', end - 1);
    const suffix = host.slice(dot + 1);
    // Tek etiketli son ek (TLD) listede yok; aramak zararsız ama gereksiz.
    if (labels > 0 && set.has(suffix)) return true;
    if (dot < 0) break;
    end = dot;
  }
  return false;
}
