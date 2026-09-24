import { standingTeamFullName, standingTeamShortCode } from '@/utils/standingsTeamLabel';
import styles from './standingTeamName.module.scss';

type Props = {
  row: Parameters<typeof standingTeamShortCode>[0];
  /** `table`: 10 sütunlu puan tablosu · `mini`: sağ sütun mini widget'ı (farklı eşik) */
  variant?: 'table' | 'mini';
};

/**
 * Puan durumu takım adı — tam isim ve (varsa) kısaltma birlikte basılır; hangisinin görüneceğine en yakın
 * `container-type: inline-size` atasının genişliği karar verir (kural + eşikler: `utils/standingsTeamLabel`).
 * Kısaltmalı durumda erişilebilir ad/tooltip çağıran bağlantının `aria-label`/`title`'ından gelir (tam isim).
 */
export default function StandingTeamName({ row, variant = 'table' }: Props) {
  const full = standingTeamFullName(row);
  const code = standingTeamShortCode(row);
  const mini = variant === 'mini';
  if (!code) return <>{full}</>;
  return (
    <>
      <span className={mini ? styles.fullMini : styles.fullTable}>{full}</span>
      <span className={mini ? styles.shortMini : styles.shortTable} aria-hidden="true" data-testid="team-short-code">
        {code}
      </span>
    </>
  );
}
