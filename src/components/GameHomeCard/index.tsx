import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { GAME_BRAND } from '@/config/brand';
import styles from './gameHomeCard.module.scss';

/** server/game/weeks.ts WEEK_MATCH_COUNT ile aynı (ana sayfa paketine sunucu modülü girmesin). */
const WEEK_MATCHES = 10;

type CurrentWeek = { week: { weekKey: string; matches: unknown[] } | null };
type MyWeek = { predictions: unknown[] };

/**
 * Ana sayfa "{{game}}" şeridi (Günün Frikiği kartının altında; GAME_PUBLIC_CLIENT iken). Sunucu HTML'i sabit kabuk ("Bu hafta 10
 * maç · Ücretsiz oyna") — SABİT yükseklik, ilk yükte istek yok (LCP/CLS'e dokunmaz). Şerit görünür alana girince: haftanın maç
 * sayısı (CDN'li uç) ve girişliyse kendi tahmin sayın ("3/10 tahminin · Oyna"). Metinler `nav` ad alanında (oyun metin dosyası
 * ana sayfa paketine girmez).
 */
export default function GameHomeCard() {
  const { t } = useTranslation('nav');
  const { status } = useSession();
  const [ref, inView] = useInViewOnce<HTMLAnchorElement>('200px');
  const [total, setTotal] = useState(WEEK_MATCHES);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (!inView || status === 'loading') return;
    let cancelled = false;
    fetch('/api/game/weeks/current')
      .then((r) => (r.ok ? (r.json() as Promise<CurrentWeek>) : null))
      .then(async (d) => {
        if (cancelled || !d?.week) return;
        if (d.week.matches.length) setTotal(d.week.matches.length);
        if (status !== 'authenticated') return;
        const me = await fetch(`/api/game/weeks/${d.week.weekKey}/me`, { credentials: 'include' }).then((r) => (r.ok ? (r.json() as Promise<MyWeek>) : null));
        if (!cancelled && me) setDone(me.predictions.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [inView, status]);

  return (
    <Link ref={ref} href={`${GAME_BRAND.basePath}?oyun=haftalik&src=home_card`} className={styles.card}>
      <span className={styles.icon} aria-hidden="true">
        🏆
      </span>
      <span className={styles.text}>
        <strong>{t('gameCard.title')}</strong>
        <span>{done != null ? t('gameCard.progress', { done, total }) : t('gameCard.week', { total })}</span>
      </span>
      <span className={styles.cta}>{done != null ? t('gameCard.play') : t('gameCard.playFree')} ›</span>
    </Link>
  );
}
