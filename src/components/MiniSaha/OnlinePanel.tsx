import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/miniSaha';
import type { OnlineClient, OnlineStatus } from './online';
import styles from './miniSaha.module.scss';

/** Davet linki (bu sayfa + ?oda=KOD). */
export function inviteLink(code: string): string {
  if (typeof window === 'undefined') return `/mini-saha?oda=${code}`;
  return `${window.location.origin}/mini-saha?oda=${code}`;
}

/**
 * Online maçın oyun dışı anları, sahnenin üstünde: bağlanıyor, arkadaş bekleniyor (davet linki: kopyala / paylaş),
 * geri sayım, rakip koptu, maç sonu (rövanş) ve hatalar (oda dolu, sunucuya ulaşılamadı → bota karşı oyna).
 * Oyun sırasında hiçbir şey göstermez (yalnız rakip koptuysa küçük bir şerit).
 */
export default function OnlinePanel({ client, status, score, onExit }: {
  client: OnlineClient;
  status: OnlineStatus;
  /** Tabeladaki skor (bu oyuncunun gözünden: [ben, rakip]). */
  score: [number, number];
  onExit: () => void;
}) {
  const { t } = useTranslation('miniSaha');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  if (status.kind === 'baglaniyor') {
    return (
      <div className={styles.onlineStrip} role="status">
        {t(status.tekrar ? 'online.reconnecting' : 'online.connecting')}
      </div>
    );
  }

  if (status.kind === 'hata') {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <h2>{t('online.errorTitle')}</h2>
          <p className={styles.modalText}>{t(`online.error.${status.kod}`)}</p>
          <div className={styles.modalRow}>
            <button type="button" className={styles.primary} onClick={onExit}>{t('online.playBots')}</button>
          </div>
        </div>
      </div>
    );
  }

  const st = status.state;
  const me = st.slot;
  const rival = me === 0 ? 1 : 0;

  if (st.faz === 'bekliyor') {
    const link = inviteLink(client.code);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      } catch {
        /* pano izni yok: kullanıcı kutudan seçer */
      }
    };
    const share = async () => {
      try {
        await navigator.share({ title: t('title'), text: t('online.shareText'), url: link });
      } catch {
        /* iptal / desteklenmiyor */
      }
    };
    const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <p className={styles.modalKicker}>{t(me === 0 ? 'online.waitTitle' : 'online.waitHost')}</p>
          <p className={styles.modalText}>{t('online.waitText')}</p>
          <div className={styles.code} aria-label={t('online.codeLabel')}>{client.code}</div>
          <input className={styles.linkBox} readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label={t('online.linkLabel')} />
          <div className={styles.modalRow}>
            <button type="button" className={styles.primary} onClick={() => void (canShare ? share() : copy())}>
              {canShare ? t('online.share') : copied ? t('online.copied') : t('online.copy')}
            </button>
            {canShare ? (
              <button type="button" className={styles.secondary} onClick={() => void copy()}>{copied ? t('online.copied') : t('online.copy')}</button>
            ) : null}
            <button type="button" className={styles.secondary} onClick={onExit}>{t('pause.exit')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (st.faz === 'sayim') {
    return (
      <div className={styles.countdown} aria-live="assertive">
        <span key={st.sayim}>{st.sayim}</span>
      </div>
    );
  }

  if (st.faz === 'oyun') {
    return st.bagli[rival] ? null : (
      <div className={styles.onlineStrip} role="status">{t('online.rivalGone')}</div>
    );
  }

  // bitti
  const result = st.kazanan === null ? 'draw' : st.kazanan === me ? 'win' : 'loss';
  const iAsked = st.rovans[me];
  const rivalAsked = st.rovans[rival];
  const rivalHere = st.bagli[rival];
  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <p className={styles.modalKicker}>{t(`end.${result}`)}</p>
        <div className={styles.result}>
          <span className={styles.dotA} />
          {score[0]} – {score[1]}
          <span className={styles.dotB} />
        </div>
        {st.neden === 'hukmen' ? <p className={styles.modalText}>{t(result === 'win' ? 'online.forfeitWin' : 'online.forfeitLoss')}</p> : null}
        {rivalAsked && !iAsked ? <p className={styles.modalText}>{t('online.rivalWantsRematch')}</p> : null}
        <div className={styles.modalRow}>
          <button type="button" className={styles.primary} disabled={iAsked || !rivalHere} onClick={() => client.rematch()}>
            {!rivalHere ? t('online.rivalLeft') : iAsked ? t('online.waitingRematch') : t('end.again')}
          </button>
          <button type="button" className={styles.secondary} onClick={onExit}>{t('pause.exit')}</button>
        </div>
      </div>
    </div>
  );
}
