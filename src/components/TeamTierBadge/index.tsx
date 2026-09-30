import { useTranslation } from '@/lib/i18n';
import type { Match } from '@/models/liveScore';
import type { TurkeyTeamTiersPayload } from '@/config/turkeyTiers';
import { cupTeamTierKey } from '@/utils/cupTeamTier';
import styles from './teamTierBadge.module.scss';

/** Kupa maçında takımın kendi ligi için kısa kademe rozeti ("Süper Lig", "1. Lig", "2. Lig"). Kademe yoksa hiçbir şey çizmez. */
export default function TeamTierBadge({
  match,
  teamId,
  tiers,
}: {
  match: Pick<Match, 'competition' | 'competition_id' | 'date'>;
  teamId: number | string | null | undefined;
  tiers: TurkeyTeamTiersPayload | null | undefined;
}) {
  const { t } = useTranslation('leagues');
  const key = cupTeamTierKey(match, teamId, tiers);
  if (!key) return null;
  return <span className={styles.badge}>{t(`tier.${key}`)}</span>;
}
