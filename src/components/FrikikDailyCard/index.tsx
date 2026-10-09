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
      <PitchDeco />
      {played ? (
        <div className={styles.row}>
          <div className={styles.text}>
            <p className={styles.kicker}>{t('frikikCard.kicker')}</p>
            <h2 id="frikik-card-title" className={styles.title}>
              {t('frikikCard.title')}
            </h2>
            <p className={styles.result}>
              <span className={styles.resultPrefix}>{t('frikikCard.today')} </span>
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
            <Link href={PLAY_HREF} className={`${styles.ghost} ${styles.ghostGold}`} onClick={onPlay}>
              {played.rank ? t('frikikCard.playAgain') : t('frikikCard.open')}
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.row}>
          <div className={styles.text}>
            <p className={styles.kicker}>{t('frikikCard.kicker')}</p>
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
            <span aria-hidden="true">⚽</span>
            {t('frikikCard.play')}
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * Süs: ceza sahası + yay + top, kodla çizilmiş SVG (~0,8 KB satır içi, istek yok, her ölçekte keskin; yazı yok).
 * Kırpılmış WebP/AVIF seçeneğine göre hafif: görsel ≥ 20 KB + ayrı istek + sabit en-boy gerektirirdi.
 */
function PitchDeco() {
  return (
    <svg className={styles.deco} viewBox="0 0 300 124" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <g className={styles.line}>
        <rect x="150" y="-20" width="220" height="164" rx="2" />
        <rect x="236" y="22" width="134" height="80" />
        <path d="M150 34 a30 30 0 0 1 0 56" />
        <circle cx="190" cy="62" r="2.2" />
        <path d="M-10 118 H 320" />
      </g>
      <g transform="translate(118 92)">
        <circle className={styles.ball} r="13" />
        <path className={styles.ballSeam} d="M0-13 L4-6 L11-5 M-11-5 L-4-6 L0-13 M-4-6 L-5 2 L0 6 L5 2 L4-6 M-5 2 L-11 6 M5 2 L11 6 M0 6 L0 13" />
      </g>
    </svg>
  );
}
