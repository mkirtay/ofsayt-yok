/**
 * Dinamik paylaşım görsellerinin (maç / takım / frikik) ortak renkleri ve zemini — varsayılan görselle
 * (public/images/og-default-v3.png) aynı dil: Scor3 siyahı zemin, sağda hafif açık eğik şerit, altta lime şerit.
 * Metin kontrastı #0A0E13 üzerinde (ogTheme.test.ts ölçer): OG_TEXT ≥ 17:1, OG_TEXT_SOFT ≥ 9:1 (WCAG AAA ≥ 7:1).
 */
export const OG_BG = '#0A0E13';
/** Eğik şerit: zeminden bir ton açık (dikkat çekmez, kompozisyonu korur). */
export const OG_PANEL = '#141A22';
export const OG_TEXT = '#F3F4EE';
export const OG_TEXT_SOFT = '#B9BCB4';
/** Logo paletinin lime'ı: vurgu (alt şerit, skor ayracı, galibiyet rozeti). */
export const OG_ACCENT = '#C6FF3A';
export const OG_LIVE = '#E5322D';
/** Rozet / çip zemini (durum, sıra). */
export const OG_CHIP = 'rgba(243,244,238,0.12)';

/**
 * Zemin katmanları: kökün (position: relative) ilk çocuğu olarak basılır. Tek mutlak kapsayıcı — satori fragment'in
 * yalnız ilk çocuğunu çiziyor.
 */
export function OgBackdrop() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex' }}>
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: -80,
          width: 260,
          height: 900,
          background: OG_PANEL,
          transform: 'rotate(18deg)',
          display: 'flex',
        }}
      />
      <div style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 12, background: OG_ACCENT, display: 'flex' }} />
    </div>
  );
}
