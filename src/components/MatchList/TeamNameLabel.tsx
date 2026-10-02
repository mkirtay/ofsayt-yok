import { TEAM_NAMES } from '@/content/teamNames';
import styles from './matchList.module.scss';

/**
 * Dar mobilde (< 640 px) kısa ada geçme eşiği — 375 px ölçümü: maç satırında isim alanı 78 px (11 px Inter 500);
 * Şampiyonlar / Avrupa Ligi + Süper Lig adlarında sığmayan en kısa ad 13, sığan en uzun ad 14 karakter.
 */
export const SHORT_NAME_MIN_CHARS = 13;

/** Dar ekranda gösterilecek kısa ad; kural dışıysa (kısa ad ya da sözlük kaydı yok) null → ellipsis. */
export function narrowTeamName(teamId: number | null | undefined, name: string): string | null {
  const entry = teamId ? TEAM_NAMES[teamId] : undefined;
  if (!entry || [...name].length < SHORT_NAME_MIN_CHARS) return null;
  return entry.shortName.length < name.length ? entry.shortName : null;
}

/**
 * Maç satırındaki takım adı. Kural uygunsa iki metin: tam ad (≥ 640 px görünür; dar ekranda yalnız ekran
 * okuyucuya) ve kısa ad (yalnız < 640 px, aria-hidden). Hangisinin görüneceğine CSS karar verir — JS ölçümü yok,
 * SSR ile istemci aynı (CLS yok). `title`'da tam ad.
 */
export default function TeamNameLabel({
  teamId,
  name,
  className,
}: {
  teamId: number | null | undefined;
  name: string;
  className: string;
}) {
  const short = narrowTeamName(teamId, name);
  if (!short) return <span className={className}>{name}</span>;
  return (
    <span className={className} title={name}>
      <span className={styles.teamNameFull}>{name}</span>
      <span className={styles.teamNameShort} aria-hidden="true">
        {short}
      </span>
    </span>
  );
}
