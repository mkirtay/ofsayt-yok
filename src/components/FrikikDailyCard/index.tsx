import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { useFrikikBoard } from '@/hooks/useFrikikBoard';
import { dayLabel, turkeyDay } from '@/lib/frikik/daily';
import { readLastRun, type LastRun } from '@/lib/frikik/localRun';
import { sharePath } from '@/lib/frikik/shareLink';
import { trackFrikik } from '@/lib/frikik/analytics';
import styles from './frikikDailyCard.module.scss';

const PLAY_HREF = '/frikik?src=home_card';

/**
 * Ana sayfa "Günün Frikiği" kartı (canlı şeridin altında; sabit değil). Sunucu HTML'i oynanmamış kabuk (veri yok);
 * tarayıcıda: bugün oynadıysa (yerel kayıt ya da tablodaki kaydı) sonucu, sırası, paylaş ve "yarın yeni frikik";
 * oynamadıysa büyük Oyna + günün en iyisi / ayın lideri. Tablo verisi kart görünür alana girince ve boşta çekilir
 * (ilk yük / LCP yoluna girmez). İki durum aynı en küçük yükseklikte → kayma yok; oynanmış kart tek satıra iner.
 */
export default function FrikikDailyCard() {
  const { t } = useTranslation('common');
  const { data: session, status } = useSession();
  const signedIn = status === 'authenticated' && !!session?.user;
  const [ref, inView] = useInViewOnce<HTMLElement>('200px');
  const { board, me } = useFrikikBoard(inView, signedIn);
  const [today, setToday] = useState<string | null>(null);
  const [local, setLocal] = useState<LastRun | null>(null);
  useEffect(() => {
    const d = dayLabel(turkeyDay(Date.now()));
    // Mount sonrası (SSR'da gün / yerel kayıt yok): kayma yok, en küçük yükseklik aynı.
    const timer = setTimeout(() => {
      setToday(d);
      setLocal(readLastRun(d));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const played = me?.today ? { level: me.today.level, score: me.today.score, rank: me.today.rank as number | null } : local ? { level: local.level, score: local.score, rank: local.recorded ? (local.rank ?? null) : null } : null;
  const bestToday = board?.daily[0] ?? null;
  const bestMonth = board?.monthly[0] ?? null;
  const onPlay = () => trackFrikik('frikik_card_click', { entry: 'home_card' });

  const share = async () => {
    if (!played || !today) return;
    const url = `${window.location.origin}${sharePath(played.level, played.score, today)}`;
    const text = t('frikikCard.shareText', { level: played.level, score: played.score });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Frikik', text, url });
        trackFrikik('frikik_shared', { level: played.level, method: 'share' });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        trackFrikik('frikik_shared', { level: played.level, method: 'clipboard' });
      }
    } catch {
      // iptal / pano yok
    }
  };

  return (
    <section ref={ref} className={styles.card} data-played={played ? '' : undefined} aria-labelledby="frikik-card-title">
      {played ? (
        <div className={styles.row}>
          <div className={styles.text}>
            <h2 id="frikik-card-title" className={styles.title}>
              {t('frikikCard.title')}
            </h2>
            <p className={styles.result}>
              {t('frikikCard.yourResult', { level: played.level, score: played.score.toLocaleString('tr-TR') })}
              {played.rank ? <span className={styles.rank}> · {t('frikikCard.yourRank', { rank: played.rank })}</span> : null}
            </p>
            <p className={styles.meta}>
              {played.rank ? t('frikikCard.tomorrow') : signedIn ? t('frikikCard.notRecorded') : t('frikikCard.signInToPost')}
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.ghost} onClick={() => void share()}>
              {t('frikikCard.share')}
            </button>
            <Link href={PLAY_HREF} className={styles.ghost} onClick={onPlay}>
              {played.rank ? t('frikikCard.playAgain') : t('frikikCard.open')}
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.row}>
          <div className={styles.text}>
            <h2 id="frikik-card-title" className={styles.title}>
              {t('frikikCard.title')}
            </h2>
            <p className={styles.meta}>{t('frikikCard.sub')}</p>
            <p className={styles.leaders} aria-live="polite">
              {bestToday ? <span>{t('frikikCard.bestToday', { nick: bestToday.nickname, level: bestToday.level })}</span> : null}
              {bestMonth ? <span>{t('frikikCard.monthLeader', { nick: bestMonth.nickname, level: bestMonth.level })}</span> : null}
            </p>
          </div>
          <Link href={PLAY_HREF} className={styles.play} onClick={onPlay}>
            {t('frikikCard.play')}
          </Link>
        </div>
      )}
    </section>
  );
}
