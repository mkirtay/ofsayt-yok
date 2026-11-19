import Image from 'next/image';
import { BRAND } from '@/config/brand';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_SVG_ON_DARK, BRAND_LOGO_SVG_ON_LIGHT } from '@/config/brandImages';
import {
  BRAND_MARK_BADGE,
  BRAND_MARK_BAR,
  BRAND_MARK_COLORS,
  BRAND_MARK_DIGIT,
  BRAND_MARK_STROKE_WIDTH,
  BRAND_MARK_VIEWBOX,
  BRAND_MARK_WORD,
} from './brandMark';
import styles from './brandLogo.module.scss';

/**
 * Zeminin rengi: `dark` / `light` sabit; `theme` sayfa temasını izler (`<html data-theme>`). `theme`'de iki varyant da
 * basılır, hangisinin görüneceğine CSS karar verir — tema ilk boyamadan önce ayarlandığı için (THEME_INIT_SCRIPT)
 * yanıp sönme / kayma olmaz, JS beklenmez.
 */
export type BrandLogoSurface = 'dark' | 'light' | 'theme';

type Props = {
  /** CSS piksel; genişlik logonun oranından hesaplanır. */
  height: number;
  surface: BrandLogoSurface;
  /**
   * Satır içi SVG (ilk ekrandaki header logosu): ayrı istek yok, LCP adayı değil (bkz. brandMark.ts). Yalnız sabit
   * zeminde (`dark` / `light`); footer gibi ilk ekran dışı yerler `<img>` kalır (HTML'e yol verisi eklenmez).
   */
  inline?: boolean;
  priority?: boolean;
  className?: string;
};

function InlineMark({ width, height, surface, className }: { width: number; height: number; surface: 'dark' | 'light'; className?: string }) {
  const c = BRAND_MARK_COLORS[surface];
  const stroke = { strokeWidth: BRAND_MARK_STROKE_WIDTH, strokeLinejoin: 'round' as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={BRAND_MARK_VIEWBOX}
      width={width}
      height={height}
      role="img"
      aria-label={BRAND.name}
      className={[styles.logo, className].filter(Boolean).join(' ')}
    >
      <path d={BRAND_MARK_WORD} fill={c.word} stroke={c.word} {...stroke} />
      <rect {...BRAND_MARK_BADGE} fill={c.badge} />
      <path d={BRAND_MARK_DIGIT} fill={c.digit} stroke={c.digit} {...stroke} />
      <rect {...BRAND_MARK_BAR} fill={c.bar} />
    </svg>
  );
}

export default function BrandLogo({ height, surface, inline, priority, className }: Props) {
  const width = Math.round(height * BRAND_LOGO_ASPECT);
  if (inline && surface !== 'theme') return <InlineMark width={width} height={height} surface={surface} className={className} />;
  const logo = (src: string, variant?: string) => (
    <Image
      src={src}
      alt={BRAND.name}
      width={width}
      height={height}
      priority={priority}
      className={[styles.logo, variant, className].filter(Boolean).join(' ')}
    />
  );
  if (surface === 'dark') return logo(BRAND_LOGO_SVG_ON_DARK);
  if (surface === 'light') return logo(BRAND_LOGO_SVG_ON_LIGHT);
  return (
    <>
      {logo(BRAND_LOGO_SVG_ON_DARK, styles.onDarkTheme)}
      {logo(BRAND_LOGO_SVG_ON_LIGHT, styles.onLightTheme)}
    </>
  );
}
