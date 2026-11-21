/**
 * Mini Saha online takma adı: üye olmayan da maça girmeden yazar; yalnız rakibe ve kendi ekranına görünür (kaydedilmez,
 * yalnız bu tarayıcıda hatırlanır). Biçim: 3–16 karakter, harf (Türkçe dahil) / rakam / boşluk / _ . -
 * İçerik: Frikik takma ad filtresi (uygunsuz + ayrılmış adlar; lib/frikik/nickname.ts) aynen kullanılır.
 *
 * Sunucu (oyun-sunucusu) yalnız biçimi zorlar (protocol.ts `cleanName`); içerik filtresi istemcide.
 */
import { BLOCKED_NICKNAME_PATTERNS, RESERVED_NICKNAMES, normalizeNickname } from '@/lib/frikik/nickname';
import { cleanName, NAME_MAX, NAME_MIN } from './protocol';

export { NAME_MAX, NAME_MIN };

export type NameCheck = { ok: true; value: string } | { ok: false; reason: 'format' | 'blocked' | 'reserved' };

export function checkGuestName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'format' };
  const value = cleanName(raw);
  if (!value) return { ok: false, reason: 'format' };
  const n = normalizeNickname(value);
  if (BLOCKED_NICKNAME_PATTERNS.some((re) => re.test(n))) return { ok: false, reason: 'blocked' };
  if (RESERVED_NICKNAMES.some((re) => re.test(n))) return { ok: false, reason: 'reserved' };
  return { ok: true, value };
}
