import { useTranslation } from '@/lib/i18n';
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
            {coaches.home ?? '—'} <span aria-hidden="true">·</span> {coaches.away ?? '—'}
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
