import type { SeasonListItem } from '@/services/liveScoreService';
import { useTranslation } from '@/lib/i18n';
import { formatSeasonLabel } from '@/utils/seasonLabel';
import styles from './seasonSelect.module.scss';

export type SeasonSelectProps = {
  seasons: SeasonListItem[];
  value: number | null;
  onChange: (id: number) => void;
  /** Visually match parent block (e.g. world cup dark surface) */
  selectClassName?: string;
  /** Dark sidebar (World Cup) */
  dark?: boolean;
};

export default function SeasonSelect({
  seasons,
  value,
  onChange,
  selectClassName,
  dark,
}: SeasonSelectProps) {
  const { t } = useTranslation('match');
  if (!seasons.length) return null;

  const resolved =
    value != null && seasons.some((s) => s.id === value) ? value : seasons[0]!.id;

  return (
    <div className={`${styles.wrap} ${dark ? styles.wrapDark : ''}`.trim()}>
      <span className={styles.label}>{t('season.label')}</span>
      <select
        className={selectClassName ?? styles.select}
        aria-label={t('season.selectLabel')}
        value={resolved}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      >
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {formatSeasonLabel(s.name)}
          </option>
        ))}
      </select>
    </div>
  );
}
