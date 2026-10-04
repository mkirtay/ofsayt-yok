import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';
import { coachHref } from '@/utils/personUrl';
import type { Match } from '@/models/liveScore';
import StadiumIcon from '@/components/icons/StadiumIcon';
import WhistleIcon from '@/components/icons/WhistleIcon';
import CoachIcon from '@/components/icons/CoachIcon';
import WeatherIcon from '@/components/icons/WeatherIcon';
import TvIcon from '@/components/icons/TvIcon';
import styles from './matchInfo.module.scss';

/**
 * Bilgi kartının hücre ızgarası: Stadyum · Hakem · Teknik Direktörler · Hava / Nerede İzlenir. Her hücre aynı stil
 * (ikon + küçük gri başlık + kalın değer, ortalı, aralarında ince ayraç). Veri olmayan hücre çizilmez; kalanlar eşit
 * genişlikte yayılır. Genişte tek satır, dar panelde / mobilde 2×2 (container query — split-view paneli viewport'tan dar).
 *
 * Dördüncü hücre: başlamamış / canlı maçta Türkiye yayıncısı varsa "Nerede İzlenir", yoksa "Hava".
 * Ek veriler (teknik direktör, hava, yayıncı) maç detayı isteğiyle gelir → SSR'da çizilir, sonradan eklenmez.
 */

export type InfoCellKey = 'stadium' | 'referee' | 'coaches' | 'tv' | 'weather';

function watchOnVisible(match: Match, phase: string): boolean {
  return (phase === 'PRE' || phase === 'LIVE' || phase === 'HT') && (match.tv_stations?.length ?? 0) > 0;
}

/** Çizilecek hücreler (sırasıyla). `refereeText` boşsa hakem hücresi yok. */
export function infoCellKeys(match: Match, phase: string, location: string, refereeText: string): InfoCellKey[] {
  const keys: InfoCellKey[] = [];
  if (location.trim()) keys.push('stadium');
  if (refereeText.trim()) keys.push('referee');
  if (match.coaches?.home || match.coaches?.away) keys.push('coaches');
  if (watchOnVisible(match, phase)) keys.push('tv');
  else if (match.weather) keys.push('weather');
  return keys;
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

function Cell({ k, icon, label, children }: { k: InfoCellKey; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className={styles.infoCell} data-info={k}>
      <dt className={styles.infoLabel}>
        {icon}
        <span>{label}</span>
      </dt>
      <dd className={styles.infoValue}>{children}</dd>
    </div>
  );
}

export type MatchInfoGridProps = {
  match: Match;
  phase: string;
  /** Stadyum (boşsa hücre yok). */
  location: string;
  /** Hakem adı ya da başlamamış maçta "Açıklanmadı" (boşsa hücre yok). */
  refereeText: string;
  /** Hakem istatistikleri varsa ad düğme olur (kartı açar / kapar). */
  refereeToggle?: { open: boolean; controlsId: string; onToggle: () => void } | null;
};

export default function MatchInfoGrid({ match, phase, location, refereeText, refereeToggle }: MatchInfoGridProps) {
  const { t } = useTranslation('match');
  const keys = infoCellKeys(match, phase, location, refereeText);
  if (keys.length === 0) return null;
  const { coaches, weather } = match;
  const cells: Record<InfoCellKey, () => ReactNode> = {
    stadium: () => (
      <Cell k="stadium" icon={<StadiumIcon className={styles.infoIcon} />} label={t('stadium')}>
        {location.trim()}
      </Cell>
    ),
    referee: () => (
      <Cell k="referee" icon={<WhistleIcon className={styles.infoIcon} />} label={t('referee')}>
        {refereeToggle ? (
          <button
            type="button"
            className={styles.refToggle}
            aria-expanded={refereeToggle.open}
            aria-controls={refereeToggle.controlsId}
            title={t('matchInfo.refereeStatsToggle')}
            onClick={refereeToggle.onToggle}
          >
            {refereeText}
          </button>
        ) : (
          refereeText
        )}
      </Cell>
    ),
    coaches: () => (
      <Cell k="coaches" icon={<CoachIcon className={styles.infoIcon} />} label={t('matchInfo.coaches')}>
        <span className={styles.infoLine}>
          <CoachName name={coaches?.home} id={coaches?.homeId} full={coaches?.homeFull} />
        </span>
        <span className={styles.infoLine}>
          <CoachName name={coaches?.away} id={coaches?.awayId} full={coaches?.awayFull} />
        </span>
      </Cell>
    ),
    tv: () => (
      <Cell k="tv" icon={<TvIcon className={styles.infoIcon} />} label={t('matchInfo.watchOn')}>
        {match.tv_stations!.join(', ')}
      </Cell>
    ),
    weather: () => (
      <Cell k="weather" icon={<WeatherIcon className={styles.infoIcon} condition={weather?.condition} />} label={t('matchInfo.weather')}>
        {weather!.tempC}°C
        {weather!.condition ? `, ${t(`matchInfo.weatherCondition.${weather!.condition}`)}` : ''}
      </Cell>
    ),
  };
  return (
    <div className={styles.infoGridWrap}>
      <dl className={styles.infoGrid} data-count={keys.length}>
        {keys.map((k) => (
          <Fragment key={k}>{cells[k]()}</Fragment>
        ))}
      </dl>
    </div>
  );
}
