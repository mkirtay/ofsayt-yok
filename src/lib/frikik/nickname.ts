/**
 * Skor tablosunda görünen takma ad = `User.username` (benzersiz; Gündem'de de "@kullanıcıadı" olarak herkese açık).
 * Burada biçim (mevcut kullanıcı adı kuralı) + uygunsuz içerik + ayrılmış ad denetimi: tabloda e-posta ve gerçek ad asla
 * görünmez, kullanıcı adı ise herkese açık olduğu için filtrelenir. Denetim saf (DB yok); benzersizlik uçta.
 *
 * Filtre: küçük harfe çevir (TR yereli), leet yazımını aç (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b), alt çizgi ve tekrarlı
 * harfleri sadeleştir; sonra desenler. Desenler kısa gövde değil çekimli kalıp (örn. "klasik" içindeki "sik" yakalanmaz).
 */
import { BRAND } from '@/config/brand';
import { usernameRules } from '@/lib/validation';

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 30;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's' };

/** Normalize edilmiş biçim: denetim bunun üstünde. */
export function normalizeNickname(raw: string): string {
  const lower = raw.toLocaleLowerCase('tr-TR');
  let out = '';
  for (const ch of lower) out += LEET[ch] ?? ch;
  return out
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/(.)\1{2,}/g, '$1$1');
}

/** Uygunsuz / hakaret kalıpları (normalize edilmiş metin üstünde). Liste kısa ve bilinçli: yanlış pozitif maliyeti var. */
export const BLOCKED_NICKNAME_PATTERNS: readonly RegExp[] = [
  // TR
  /\bam[kq]\b|(^|\d)am[kq]|am[kq]$|amina|aminakoy|amcik|amcik|ananiskim|anan[iı]s/,
  /siktir|sikik|sikerim|sikeyim|sikis|sikici|sikim|sikem|sikt|^sik($|\d)/,
  /yarr?ak|yarag|orospu|orosbu|orusp|kahpe|pezevenk|kaltak|surtuk|tasak|tassak|gavat|yavsak|pust\b|^pust|ibne|ibine|godos|gotveren|gotunu|gotlek|pic\b|^pic$|picin|picler/,
  /\boc\b|^oc$|^o[cç]$|\baq\b|^aq$|mk$|^mk|sg$/,
  // EN
  /fuck|fuk\b|fuq|shit|bitch|(^|\d)cunt|cunt(s|$)|dick(s|head|$)|pussy|nigg|fagg|\bfag\b|^fag|whore|slut|asshole|arsehole|cock(s|er)?$|cocksuck|retard|wank|twat|bastard/,
  // nefret / tarihsel
  /nazi|hitler|isis\b|^isis/,
];

/** Ayrılmış adlar: marka ve yetkili izlenimi verenler. */
export const RESERVED_NICKNAMES: readonly RegExp[] = [/admin|moderat|^mod\b|^mod\d*$|resmi|official|destek|support|^bot$|^bot\d*$|sistem|system/];

export type NicknameCheck = { ok: true; value: string } | { ok: false; reason: 'format' | 'blocked' | 'reserved' };

/** Biçim + içerik denetimi; geçerliyse kırpılmış değer. Benzersizlik burada DEĞİL (uçta DB). */
export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'format' };
  const value = raw.trim();
  if (value.length < NICKNAME_MIN || value.length > NICKNAME_MAX || !usernameRules.pattern.test(value)) {
    return { ok: false, reason: 'format' };
  }
  const n = normalizeNickname(value);
  const brand = normalizeNickname(BRAND.compactName);
  if (n.includes(brand) || RESERVED_NICKNAMES.some((re) => re.test(n))) return { ok: false, reason: 'reserved' };
  if (BLOCKED_NICKNAME_PATTERNS.some((re) => re.test(n))) return { ok: false, reason: 'blocked' };
  return { ok: true, value };
}
