import { useId, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import type { MatchVenue } from '@/models/liveScore';
import { hasVenueCard, venueMapsUrl } from '@/services/sportmonks/venueFormatter';
import { venueImageSrc } from '@/utils/logoUrl';
import StadiumIcon from '@/components/icons/StadiumIcon';
import styles from './matchVenueCard.module.scss';

/** Fotoğrafın en geniş CSS genişliği (masaüstü yan sütun / mobil tam genişlik ≈ 320–360 px) → 640 px webp. */
const PHOTO_DISPLAY_PX = 320;

type Props = {
  venue: MatchVenue | null | undefined;
  /** Kart zaten flex `gap`'li bir sütundaysa üst boşluk çift sayılmasın. */
  flush?: boolean;
};

/**
 * Maç sayfası Genel Bakış "Stadyum" kartı: fotoğraf (tembel, sabit 16:9 yer → CLS yok), ad, şehir, kapasite, zemin,
 * adres, "Haritada aç". Yalnız dolu satırlar; ad / şehirden öte bilgi yoksa kart hiç çizilmez (bkz. `hasVenueCard`).
 */
export default function MatchVenueCard({ venue, flush = false }: Props) {
  const { t } = useTranslation('match');
  const { locale } = useI18n();
  const [photoFailed, setPhotoFailed] = useState(false);
  const titleId = useId();
  if (!hasVenueCard(venue)) return null;

  const photo = venueImageSrc(venue.image, PHOTO_DISPLAY_PX);
  const mapsUrl = venueMapsUrl(venue);
  const name = venue.name ?? t('venueCard.title');
  const capacity = venue.capacity ? new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'tr-TR').format(venue.capacity) : null;

  return (
    <section className={`${styles.card} ${flush ? styles.flush : ''}`.trim()} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        <StadiumIcon className={styles.titleIcon} />
        {t('venueCard.title')}
      </h2>
      <div className={`${styles.body} ${photo ? styles.withPhoto : ''}`.trim()}>
        {photo ? (
          <div className={styles.photo}>
            {!photoFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- next/image kullanılmıyor (bkz. utils/logoUrl.ts)
              <img
                src={photo}
                alt={venue.name ? t('venueCard.photoAlt', { name: venue.name }) : t('venueCard.photoAltFallback')}
                width={640}
                height={360}
                loading="lazy"
                decoding="async"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <StadiumIcon className={styles.photoFallbackIcon} />
            )}
          </div>
        ) : null}
        <div className={styles.details}>
          {venue.name ? <p className={styles.name}>{venue.name}</p> : null}
          <dl className={styles.rows}>
            {venue.city ? (
              <div className={styles.row}>
                <dt>{t('venueCard.city')}</dt>
                <dd>{venue.city}</dd>
              </div>
            ) : null}
            {capacity ? (
              <div className={styles.row}>
                <dt>{t('venueCard.capacity')}</dt>
                <dd>{capacity}</dd>
              </div>
            ) : null}
            {venue.surface ? (
              <div className={styles.row}>
                <dt>{t('venueCard.surface')}</dt>
                <dd>{t(`venueCard.surfaceType.${venue.surface}`)}</dd>
              </div>
            ) : null}
            {venue.address ? (
              <div className={styles.row}>
                <dt>{t('venueCard.address')}</dt>
                <dd>{venue.address}</dd>
              </div>
            ) : null}
          </dl>
          {mapsUrl ? (
            <a
              className={styles.mapLink}
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('venueCard.openMapLabel', { name })}
            >
              {t('venueCard.openMap')}
              <span aria-hidden className={styles.external}>↗</span>
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
