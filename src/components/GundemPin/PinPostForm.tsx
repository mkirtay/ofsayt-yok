import { useState } from 'react';
import BuyCreditsButton from '@/components/BuyCredits';
import { GundemApiError, useGundemPin, usePlacePinBid } from '@/hooks/useGundem';
import { useCredits } from '@/hooks/useCredits';
import { useTranslation } from '@/lib/i18n';
import styles from './gundemPin.module.scss';

/**
 * Kendi Gündem gönderisini 1. sıraya sabitleme (2026-11-23): ayrı mesaj yazmadan, gönderinin ilk 140 karakteri.
 * Teklif kuralları 1. sıra formuyla aynı (lib/pinBid.ts); POST /api/gundem/pin `{ amount, postId }`.
 */
export default function PinPostForm({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { t } = useTranslation('gundem');
  const { credits, apply } = useCredits();
  const pin = useGundemPin();
  const place = usePlacePinBid();
  const [amount, setAmount] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const state = pin.data;
  if (!state) return null;
  if (state.leader?.isMine && !done) return <p className={styles.yours}>{t('pin.yours')}</p>;
  const minBid = state.minBid;
  const bid = amount === '' ? minBid : amount;
  const notEnough = bid > credits;
  const canSubmit = bid >= minBid && !notEnough && !place.isPending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const res = await place.mutateAsync({ amount: bid, postId });
      apply(res.credits);
      setDone(true);
      onClose();
    } catch (err) {
      setError(err instanceof GundemApiError && err.message !== 'error' && err.message !== 'network' ? err.message : t('pin.error'));
    }
  };

  return (
    <form className={styles.form} onSubmit={submit} aria-label={t('pin.pinPostTitle')}>
      <strong className={styles.label}>{t('pin.pinPostTitle')}</strong>
      <p className={styles.rules}>{t('pin.pinPostHint')}</p>
      <div className={styles.amountRow}>
        <label className={styles.label} htmlFor={`pin-post-${postId}`}>
          {t('pin.amountLabel')}
        </label>
        <input
          id={`pin-post-${postId}`}
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
          {t('pin.needCredits')} <BuyCreditsButton className={styles.link}>{t('pin.buyCredits')}</BuyCreditsButton>
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          {t('pin.cancel')}
        </button>
        <button type="submit" className={styles.submit} disabled={!canSubmit} aria-busy={place.isPending}>
          {place.isPending ? t('pin.submitting') : t('pin.submit', { amount: bid })}
        </button>
      </div>
    </form>
  );
}
