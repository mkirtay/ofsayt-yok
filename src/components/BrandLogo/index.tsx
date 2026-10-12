import Image from 'next/image';
import { BRAND } from '@/config/brand';
import { BRAND_LOGO_ASPECT, BRAND_LOGO_SVG_ON_DARK, BRAND_LOGO_SVG_ON_LIGHT } from '@/config/brandImages';
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
  priority?: boolean;
  className?: string;
};

export default function BrandLogo({ height, surface, priority, className }: Props) {
  const width = Math.round(height * BRAND_LOGO_ASPECT);
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
