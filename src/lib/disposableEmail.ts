/**
 * Tek kullanımlık (geçici) e-posta alan adı kontrolü — şifreli kayıtta reddedilir (kayıt bonusu ve haftalık ücretsiz açma
 * suistimaline karşı; kredi modeli v2). Liste: config/disposableEmailDomains.generated.ts (CC0). Alt alan adları da
 * yakalanır (x.mailinator.com). Google hesapları bu kontrolden geçmez (e-posta Google'da doğrulanmış).
 */
import { DISPOSABLE_EMAIL_DOMAINS_TEXT } from '@/config/disposableEmailDomains.generated';

let domains: Set<string> | null = null;

export function isDisposableEmail(email: string): boolean {
  domains ??= new Set(DISPOSABLE_EMAIL_DOMAINS_TEXT.split('\n'));
  const host = email.trim().toLowerCase().split('@')[1];
  if (!host) return false;
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (domains.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}
