import { useEffect, useState } from 'react';
import { useAdsVisible } from '@/hooks/useAdsVisible';
import { SPONSORS, type Sponsor } from '@/config/sponsors';
import styles from './sponsorSlider.module.scss';

type SponsorSliderProps = {
  sponsors?: Sponsor[];
  /** Otomatik ilerleme aralığı (ms). Hareket azaltma tercihinde / hover-focus'ta durur. */
  intervalMs?: number;
  className?: string;
};

/** Her sayfada kaç sponsor yan yana görünür (dar ekranda CSS ile 2'ye düşer). */
const PER_PAGE = 4;

function SponsorItem({ s }: { s: Sponsor }) {
  const inner = s.logo ? (
    <img src={s.logo} alt={s.name} className={styles.logo} loading="lazy" />
  ) : (
    <span className={styles.name}>{s.name}</span>
  );
  return s.href ? (
    <a href={s.href} className={styles.item} target="_blank" rel="sponsored noopener noreferrer">
      {inner}
    </a>
  ) : (
    <span className={`${styles.item} ${s.placeholder ? styles.itemPlaceholder : ''}`.trim()}>{inner}</span>
  );
}

/**
 * Anlaşmalı sponsor markaları için basit dönen şerit — ŞİMDİLİK yer tutucu veriyle.
 * `NEXT_PUBLIC_ADS_ENABLED` kapalıyken / premium kullanıcıda render edilmez (bkz. `useAdsVisible`).
 */
export default function SponsorSlider({ sponsors = SPONSORS, intervalMs = 5000, className }: SponsorSliderProps) {
  const visible = useAdsVisible();
  const pages = Math.max(1, Math.ceil(sponsors.length / PER_PAGE));
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!visible || pages < 2 || paused) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setPage((p) => (p + 1) % pages), intervalMs);
    return () => window.clearInterval(id);
  }, [visible, pages, paused, intervalMs]);

  if (!visible || sponsors.length === 0) return null;

  const items = sponsors.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <section
      className={[styles.slider, className].filter(Boolean).join(' ')}
      aria-label="Sponsorlar"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.label}>Sponsorlar</span>
      <div className={styles.track} key={page}>
        {items.map((s) => (
          <SponsorItem key={s.id} s={s} />
        ))}
      </div>
      {pages > 1 ? (
        <div className={styles.dots} role="group" aria-label="Sponsor sayfaları">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" className={`${styles.dot} ${i === page ? styles.dotActive : ''}`.trim()} aria-label={`Sayfa ${i + 1}`} aria-current={i === page} onClick={() => setPage(i)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
