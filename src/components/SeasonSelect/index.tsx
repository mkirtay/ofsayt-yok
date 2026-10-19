import type { SeasonListItem } from '@/services/liveScoreService';
import { useTranslation } from '@/lib/i18n';
import { formatSeasonLabel } from '@/utils/seasonLabel';
import styles from './seasonSelect.module.scss';

export type SeasonSelectProps = {
  seasons: SeasonListItem[];
  value: number | null;
  onChange: (id: number) => void;
  /** Ebeveyn bloğa uyan seçici sınıfı */
  selectClassName?: string;
  /** Yükleniyor yer tutucusu: aynı ölçü, seçilemez. */
  disabled?: boolean;
};

export default function SeasonSelect({
  seasons,
  value,
  onChange,
  selectClassName,
  disabled,
}: SeasonSelectProps) {
  const { t } = useTranslation('match');
  if (!seasons.length) return null;

  const resolved =
    value != null && seasons.some((s) => s.id === value) ? value : seasons[0]!.id;

  return (
    <div className={styles.wrap}>
      <span className={styles.label}>{t('season.label')}</span>
      <select
        className={selectClassName ?? styles.select}
        aria-label={t('season.selectLabel')}
        value={resolved}
        disabled={disabled}
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
