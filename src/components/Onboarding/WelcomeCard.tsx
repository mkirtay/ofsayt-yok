import { useId, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from '@/lib/i18n';
import { hintLabels } from './labels';
import { INTRO_DONE_EVENT, ONBOARD_ANCHORS, WELCOME_ATTR, markOnboardSeen } from './storage';
import styles from './welcomeCard.module.scss';

/**
 * Ana sayfa karşılama kartı (ilk ziyaret) — maç listesinin üstünde, listedeki kartlar gibi; tam ekran değil.
 *
 * Sunucu HTML'inde hep çizilir ama CSS ile gizlidir; görünürlüğü boyamadan önce çalışan `WELCOME_BOOT_SCRIPT`
 * (`<html data-onboard-welcome>`) belirler → hydration sonrası araya girip listeyi itmez (CLS 0). Kapatınca
 * öznitelik kalkar ve localStorage'a yazılır; bir daha çıkmaz. "Kısa tur" baloncuk katmanını ancak tıklanınca yükler.
 */
export default function WelcomeCard() {
  const { t } = useTranslation('common');
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);

  const dismiss = () => {
    markOnboardSeen('welcome');
    document.documentElement.removeAttribute(WELCOME_ATTR);
    window.dispatchEvent(new Event(INTRO_DONE_EVENT));
  };

  /** Kart kaybolunca odak listenin ilk maçına (yoksa listeye) geçer — odak `<body>`'ye düşmesin. */
  const focusList = (): HTMLElement | null => {
    const row = document.querySelector<HTMLElement>(`#hub-list ${ONBOARD_ANCHORS.matchRow}`);
    if (row) return row;
    const list = document.getElementById('hub-list');
    if (list && !list.hasAttribute('tabindex')) list.setAttribute('tabindex', '-1');
    return list;
  };

  const close = () => {
    const hadFocus = cardRef.current?.contains(document.activeElement) ?? false;
    dismiss();
    if (hadFocus) focusList()?.focus({ preventScroll: true });
  };

  const startTour = () => {
    dismiss();
    void import('./hintLayer').then(({ startTour: run }) =>
      run(
        [
          { anchors: [ONBOARD_ANCHORS.matchRow], title: t('onboarding.tourMatchTitle'), body: t('onboarding.tourMatch') },
          { anchors: [ONBOARD_ANCHORS.favStar], title: t('onboarding.tourStarTitle'), body: t('onboarding.tourStar') },
          { anchors: [ONBOARD_ANCHORS.gundem], title: t('onboarding.tourGundemTitle'), body: t('onboarding.tourGundem') },
          {
            anchors: [ONBOARD_ANCHORS.assistantFab, ONBOARD_ANCHORS.matchRow],
            title: t('onboarding.tourAiTitle'),
            body: t('onboarding.tourAi'),
          },
        ],
        hintLabels(t),
        { returnFocus: focusList },
      ),
    );
  };

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  return (
    <section ref={cardRef} className={styles.card} aria-labelledby={titleId} onKeyDown={onKeyDown}>
      <div className={styles.content}>
        <h2 id={titleId} className={styles.title}>
          {t('onboarding.welcomeTitle')}
        </h2>
        <ul className={styles.items}>
          <li>
            <span className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
                <path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z" />
              </svg>
            </span>
            {t('onboarding.itemMatch')}
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
              </svg>
            </span>
            {t('onboarding.itemStar')}
          </li>
          <li>
            <span className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z" />
              </svg>
            </span>
            {t('onboarding.itemGundem')}
          </li>
        </ul>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.tour} onClick={startTour}>
          {t('onboarding.tour')}
        </button>
        <button type="button" className={styles.dismiss} onClick={close} aria-label={t('onboarding.dismissAria')}>
          {t('onboarding.dismiss')} <span aria-hidden="true">✕</span>
        </button>
      </div>
    </section>
  );
}
