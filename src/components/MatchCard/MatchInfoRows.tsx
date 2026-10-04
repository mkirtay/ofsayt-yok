import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { coachHref } from '@/utils/personUrl';
import type { Match } from '@/models/liveScore';
import styles from './matchInfo.module.scss';

/**
 * Bilgi kartının ek satırları (maç detayı isteğiyle gelir → SSR'da çizilir, sonradan eklenmez):
 * nerede izlenir (yalnız başlamamış / canlı maçta, Türkiye yayıncıları), teknik direktörler, hava. Veri yoksa satır yok.
 */
export function matchInfoRowsVisible(match: Match, phase: string): boolean {
  return Boolean(watchOnVisible(match, phase) || match.coaches?.home || match.coaches?.away || match.weather);
}

function watchOnVisible(match: Match, phase: string): boolean {
  return (phase === 'PRE' || phase === 'LIVE' || phase === 'HT') && (match.tv_stations?.length ?? 0) > 0;
}

/** Teknik direktör adı → teknik direktör sayfası (id yoksa düz metin). */
function CoachName({ name, id, full }: { name?: string; id?: number; full?: string }) {
  if (!name) return <>—</>;
  // Link tam adla (sayfanın kanonik slug'ı) — kısa adla 301'e düşmesin.
  return id ? (
    <Link href={coachHref(id, full ?? name)} className={styles.personLink} prefetch={false}>
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

export default function MatchInfoRows({ match, phase }: { match: Match; phase: string }) {
  const { t } = useTranslation('match');
  if (!matchInfoRowsVisible(match, phase)) return null;
  const { coaches, weather } = match;
  return (
    <dl className={styles.infoRows}>
      {watchOnVisible(match, phase) ? (
        <div className={styles.infoRow} data-info="tv">
          <dt>{t('matchInfo.watchOn')}</dt>
          <dd>{match.tv_stations!.join(', ')}</dd>
        </div>
      ) : null}
      {coaches?.home || coaches?.away ? (
        <div className={styles.infoRow} data-info="coaches">
          <dt>{t('matchInfo.coaches')}</dt>
          <dd>
            <CoachName name={coaches.home} id={coaches.homeId} full={coaches.homeFull} /> <span aria-hidden="true">·</span>{' '}
            <CoachName name={coaches.away} id={coaches.awayId} full={coaches.awayFull} />
          </dd>
        </div>
      ) : null}
      {weather ? (
        <div className={styles.infoRow} data-info="weather">
          <dt>{t('matchInfo.weather')}</dt>
          <dd>
            {weather.tempC}°C
            {weather.condition ? `, ${t(`matchInfo.weatherCondition.${weather.condition}`)}` : ''}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
