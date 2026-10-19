import { useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import Avatar from '@/components/Avatar';
import BuyCreditsButton from '@/components/BuyCredits';
import { GundemApiError, useGundemPin, usePlacePinBid, useRemovePin } from '@/hooks/useGundem';
import { useCredits } from '@/hooks/useCredits';
import { useTranslation } from '@/lib/i18n';
import { isAdminUser } from '@/lib/userRole';
import styles from './gundemPin.module.scss';

/**
 * Gündem 1. sırası (haftalık teklif; kurallar lib/pinBid.ts): liderin mesajı + "1. sıraya geç" formu. Ana sayfa Gündem
 * paneli ve /gundem akışının üstünde. Veri yoksa / hata olursa hiçbir şey çizmez (akışı bozmaz).
 */
export default function GundemPin({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('gundem');
  const { data: session, status } = useSession();
  const authenticated = status === 'authenticated';
  const admin = authenticated && isAdminUser(session?.user);
  const { credits, apply } = useCredits();
  const pin = useGundemPin();
  const place = usePlacePinBid();
  const remove = useRemovePin();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  const state = pin.data;
  if (!state) return null;
  const { leader, minBid } = state;
  const bid = amount === '' ? minBid : amount;
  const tooLow = bid < minBid;
  const notEnough = authenticated && bid > credits;
  const canSubmit = message.trim().length > 0 && !tooLow && !notEnough && !place.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const res = await place.mutateAsync({ amount: bid, message: message.trim() });
      apply(res.credits);
      setOpen(false);
      setMessage('');
      setAmount('');
    } catch (err) {
      setError(err instanceof GundemApiError && err.message !== 'error' && err.message !== 'network' ? err.message : t('pin.error'));
    }
  };

  const leaderName = leader ? (leader.user.name ?? leader.user.username ?? '') : '';

  return (
    <section className={`${styles.pin} ${compact ? styles.compact : ''}`.trim()} aria-label={t('pin.title')}>
      <div className={styles.head}>
        <span className={styles.badge}>{t('pin.badge')}</span>
        <span className={styles.resets}>{t('pin.resets')}</span>
      </div>

      {leader ? (
        <div className={styles.leader}>
          <Link href={`/gundem/kullanici/${leader.user.id}`} className={styles.avatarLink} aria-label={leaderName}>
            <Avatar name={leaderName} image={leader.user.image} size={32} />
          </Link>
          <div className={styles.leaderBody}>
            <div className={styles.leaderMeta}>
              <Link href={`/gundem/kullanici/${leader.user.id}`} className={styles.name}>
                {leaderName}
              </Link>
              <span className={styles.amount}>{t('pin.amount', { amount: leader.amount })}</span>
            </div>
            <p className={styles.message}>{leader.message ?? <em className={styles.hidden}>{t('pin.hidden')}</em>}</p>
          </div>
          {admin ? (
            <button
              type="button"
              className={styles.remove}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(t('pin.removeConfirm'))) remove.mutate(leader.id);
              }}
            >
              {t('pin.remove')}
            </button>
          ) : null}
        </div>
      ) : (
        <p className={styles.empty}>{t('pin.empty')}</p>
      )}

      {leader?.isMine ? (
        <p className={styles.yours}>{t('pin.yours')}</p>
      ) : !authenticated ? (
        <Link href="/auth/signin" className={styles.cta}>
          {t('pin.signIn')}
        </Link>
      ) : !open ? (
        <button type="button" className={styles.cta} onClick={() => setOpen(true)}>
          {t('pin.cta')} · {t('pin.ctaMin', { min: minBid })}
        </button>
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <label className={styles.label} htmlFor="gundem-pin-message">
            {t('pin.messageLabel')}
          </label>
          <textarea
            id="gundem-pin-message"
            className={styles.textarea}
            value={message}
            maxLength={state.messageMaxLength}
            rows={2}
            placeholder={t('pin.messagePlaceholder')}
            onChange={(e) => setMessage(e.target.value.replace(/\n/g, ' '))}
          />
          <span className={styles.counter}>
            {message.length}/{state.messageMaxLength}
          </span>
          <div className={styles.amountRow}>
            <label className={styles.label} htmlFor="gundem-pin-amount">
              {t('pin.amountLabel')}
            </label>
            <input
              id="gundem-pin-amount"
              className={styles.amountInput}
              type="number"
              inputMode="numeric"
              min={minBid}
              max={state.maxBid}
              step={1}
              value={amount === '' ? minBid : amount}
              onChange={(e) => setAmount(e.target.value === '' ? '' : Math.floor(Number(e.target.value)))}
            />
            <span className={styles.balance}>{t('pin.balance', { credits })}</span>
          </div>
          <p className={styles.rules}>{t('pin.rules')}</p>
          {notEnough ? (
            <p className={styles.error} role="alert">
              {t('pin.needCredits')}{' '}
              <BuyCreditsButton className={styles.link}>{t('pin.buyCredits')}</BuyCreditsButton>
            </p>
          ) : null}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={() => setOpen(false)}>
              {t('pin.cancel')}
            </button>
            <button type="submit" className={styles.submit} disabled={!canSubmit} aria-busy={place.isPending}>
              {place.isPending ? t('pin.submitting') : t('pin.submit', { amount: bid })}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
