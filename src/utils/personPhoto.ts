/**
 * Kişi (hakem) fotoğrafı: Sportmonks `image_path`. Hakemlerin büyük çoğunluğunda genel yer tutucu geliyor
 * (`images/soccer/placeholder.png`; 2026-11-19: Süper Lig 2026/27 hakemlerinin hepsi, UCL 2026/27'nin 387 görevlisinden
 * 385'i) → `null` (arayüz baş harf avatarına düşer). Gerçek görseller `images//soccer/referees/{n}/{id}.png` biçiminde çift
 * eğik çizgiyle geliyor; görsel proxy'si (utils/logoUrl.ts) yalnız tek eğik çizgili yolu kabul ettiği için düzeltilir.
 */
export function personPhoto(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || /placeholder/i.test(v)) return null;
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  u.pathname = u.pathname.replace(/\/{2,}/g, '/');
  return u.toString();
}
