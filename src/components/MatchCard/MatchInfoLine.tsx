import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';
import { coachHref } from '@/utils/personUrl';
import type { Match } from '@/models/liveScore';
import StadiumIcon from '@/components/icons/StadiumIcon';
import WhistleIcon from '@/components/icons/WhistleIcon';
import WeatherIcon from '@/components/icons/WeatherIcon';
import TvIcon from '@/components/icons/TvIcon';
import styles from './matchInfo.module.scss';

/**
 * Saat / skorun altındaki tek kompakt bilgi satırı: Stadyum · Hakem · Nerede İzlenir (yoksa Hava). Her öğe küçük ikon
 * + değer; başlık yalnız ekran okuyucuya. Veri olmayan öğe çizilmez. Genişte "·" ayraçlı tek satır, dar kapsayıcıda
 * (container query — split-view paneli viewport'tan dar) ayraçsız sarar.
 *
 * Nerede İzlenir: başlamamış / canlı maçta Türkiye yayıncısı varsa; yoksa Hava. Ek veriler (yayıncı, hava, teknik
 * direktör) maç detayı isteğiyle gelir → SSR'da çizilir, sonradan eklenmez.
 */

export type InfoItemKey = 'stadium' | 'referee' | 'tv' | 'weather';

function watchOnVisible(match: Match, phase: string): boolean {
  return (phase === 'PRE' || phase === 'LIVE' || phase === 'HT') && (match.tv_stations?.length ?? 0) > 0;
}

/** Çizilecek öğeler (sırasıyla). `refereeText` boşsa hakem yok. */
export function infoItemKeys(match: Match, phase: string, location: string, refereeText: string): InfoItemKey[] {
  const keys: InfoItemKey[] = [];
  if (location.trim()) keys.push('stadium');
  if (refereeText.trim()) keys.push('referee');
  if (watchOnVisible(match, phase)) keys.push('tv');
  else if (match.weather) keys.push('weather');
  return keys;
}

/** Teknik direktör adı → teknik direktör sayfası (id yoksa düz metin). Takım adının altında, küçük ve gri. */
export function CoachLink({ name, id, full }: { name?: string; id?: number; full?: string }) {
  if (!name) return null;
  // Link tam adla (sayfanın kanonik slug'ı) — kısa adla 301'e düşmesin.
  return id ? (
    <Link href={coachHref(id, full ?? name)} className={styles.coachName} prefetch={false}>
      {name}
    </Link>
  ) : (
    <span className={styles.coachName}>{name}</span>
  );
}

function Item({ k, icon, label, children }: { k: InfoItemKey; icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className={styles.infoItem} data-info={k} title={label}>
      {icon}
      <span className={styles.srOnly}>{label}: </span>
      <span className={styles.infoValue}>{children}</span>
    </li>
  );
}

export type MatchInfoLineProps = {
  match: Match;
  phase: string;
  /** Stadyum (boşsa öğe yok). */
  location: string;
  /** Hakem adı ya da başlamamış maçta "Açıklanmadı" (boşsa öğe yok). */
  refereeText: string;
  /** Hakem istatistikleri varsa ad düğme olur (kartı açar / kapar). */
  refereeToggle?: { open: boolean; controlsId: string; onToggle: () => void } | null;
};

export default function MatchInfoLine({ match, phase, location, refereeText, refereeToggle }: MatchInfoLineProps) {
  const { t } = useTranslation('match');
  const keys = infoItemKeys(match, phase, location, refereeText);
  if (keys.length === 0) return null;
  const { weather } = match;
  const items: Record<InfoItemKey, () => ReactNode> = {
    stadium: () => (
      <Item k="stadium" icon={<StadiumIcon className={styles.infoIcon} />} label={t('stadium')}>
        {location.trim()}
      </Item>
    ),
    referee: () => (
      <Item k="referee" icon={<WhistleIcon className={styles.infoIcon} />} label={t('referee')}>
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
      </Item>
    ),
    tv: () => (
      <Item k="tv" icon={<TvIcon className={styles.infoIcon} />} label={t('matchInfo.watchOn')}>
        {match.tv_stations!.join(', ')}
      </Item>
    ),
    weather: () => (
      <Item k="weather" icon={<WeatherIcon className={styles.infoIcon} condition={weather?.condition} />} label={t('matchInfo.weather')}>
        {weather!.tempC}°C
        {weather!.condition ? `, ${t(`matchInfo.weatherCondition.${weather!.condition}`)}` : ''}
      </Item>
    ),
  };
  return (
    <div className={styles.infoLineWrap}>
      <ul className={styles.infoLine}>
        {keys.map((k) => (
          <Fragment key={k}>{items[k]()}</Fragment>
        ))}
      </ul>
    </div>
  );
}
