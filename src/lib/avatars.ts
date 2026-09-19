/** Hazır avatar galerisi (public/avatars/*.svg) — dosya yükleme altyapısı YOK; kullanıcı galeriden seçer ya da kendi URL'sini girer. */
export const AVATAR_GALLERY = [
  'ball',
  'boot',
  'whistle',
  'trophy',
  'gloves',
  'corner-flag',
  'shirt',
  'yellow-card',
  'red-card',
  'stadium',
  'goal',
  'captain',
] as const;

export type AvatarId = (typeof AVATAR_GALLERY)[number];

export const avatarUrl = (id: AvatarId) => `/avatars/${id}.svg`;

/** Yalnızca galerideki (site içi) avatar yolları — sunucu tarafı doğrulaması: serbest göreli yol kabul edilmez. */
export function isGalleryAvatarUrl(url: string): boolean {
  const m = /^\/avatars\/([a-z-]+)\.svg$/.exec(url);
  return m != null && (AVATAR_GALLERY as readonly string[]).includes(m[1]);
}

/**
 * DEPOLAMA normalizasyonu: kendi sitemizin galeri avatarı tam URL olarak gelirse (`https://<base>/avatars/x.svg`,
 * API çıktısı yazma yoluna geri döndüğünde olur) göreli forma (`/avatars/x.svg`) çevrilir. Diğer değerler aynen.
 * Böylece depolama formatı sabit kalır (host değişse de avatar kırılmaz).
 */
export function toStoredImage(value: string, base: string): string {
  const prefix = `${base.replace(/\/+$/, '')}/avatars/`;
  if (value.startsWith(prefix)) {
    const rel = `/avatars/${value.slice(prefix.length)}`;
    if (isGalleryAvatarUrl(rel)) return rel;
  }
  return value;
}

/** Galeri avatarı mı (göreli ya da tam URL) — arayüzde seçili avatarı işaretlemek için; `/avatars/<id>.svg` döner. */
export function galleryPathOf(value: string): string | null {
  const m = /^(?:https?:\/\/[^/]+)?(\/avatars\/[a-z-]+\.svg)$/.exec(value);
  return m && isGalleryAvatarUrl(m[1]) ? m[1] : null;
}
