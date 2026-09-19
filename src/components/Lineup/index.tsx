import { useState } from 'react';
import Link from 'next/link';
import { LineupPlayer } from '@/models/domain';
import { LineupSkeleton } from '@/components/Skeleton';
import { buildFormationLayout } from '@/utils/lineupFormation';
import { POSITION_LABEL_TR, positionLabel } from '@/utils/positionLabel';
import styles from './lineup.module.scss';

interface LineupProps {
  lineups: any | null;
  loading?: boolean;
}

/** "Rodrigo De Paul" -> "R. D. Paul" (saha üzerinde kompakt gösterim). */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return name;
  const last = parts[parts.length - 1];
  const initials = parts
    .slice(0, -1)
    .map((p) => `${p.charAt(0).toUpperCase()}.`)
    .join(' ');
  return `${initials} ${last}`;
}

/** Reyting rozeti metni: tek ondalık; geçersiz / ≤0 / eksikse `null` (rozet hiç çizilmez — asla "0"). */
export function formatPlayerRating(rating: number | null | undefined): string | null {
  if (typeof rating !== 'number' || !Number.isFinite(rating) || rating <= 0) return null;
  return rating.toFixed(1);
}

/** Oyuncu detay sayfasına (`/players/{id}`) bağlantı; id yoksa düz kutu. */
function Wrapper({ playerId, className, title, children }: { playerId?: string; className: string; title: string; children: React.ReactNode }) {
  return playerId ? (
    <Link href={`/players/${playerId}`} className={className} title={title} prefetch={false}>
      {children}
    </Link>
  ) : (
    <div className={className} title={title}>
      {children}
    </div>
  );
}

function PlayerToken({ player, team }: { player: LineupPlayer; team: 'home' | 'away' }) {
  // CDN'de dosya yoksa / ağ hatasında forma numaralı daireye düşülür.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(player.photo) && !photoFailed;
  const rating = formatPlayerRating(player.rating);
  return (
    <Wrapper className={styles.formationPlayer} title={player.name} playerId={player.id}>
      <span
        className={`${styles.formationDot} ${team === 'home' ? styles.formationDotHome : styles.formationDotAway} ${
          showPhoto ? styles.formationDotPhoto : ''
        }`.trim()}
      >
        {showPhoto ? (
          <img
            src={player.photo}
            alt=""
            className={styles.formationPhoto}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          player.shirt_number
        )}
        {rating ? (
          <span className={styles.ratingBadge} data-testid="player-rating" aria-label={`Reyting ${rating}`}>
            {rating}
          </span>
        ) : null}
        {player.nationality?.flag ? (
          <img
            src={player.nationality.flag}
            alt=""
            title={player.nationality.name}
            className={styles.flagBadge}
            data-testid="player-flag"
            loading="lazy"
          />
        ) : null}
      </span>
      <span className={styles.formationName}>{shortName(player.name)}</span>
      {player.pos_code ? <span className={styles.formationPos} data-testid="player-pos">{player.pos_code}</span> : null}
    </Wrapper>
  );
}

function flattenRows(rows: LineupPlayer[][]): LineupPlayer[] {
  return rows.flat();
}

export { POSITION_LABEL_TR, positionLabel };

function CompactRow({ player, side, shortCode }: { player: LineupPlayer; side: 'home' | 'away'; shortCode?: boolean }) {
  // Foto yüklenemezse (CDN/ağ) avatar yerine nötr daire — sahadaki ikonlarla aynı fallback mantığı.
  const [photoFailed, setPhotoFailed] = useState(false);
  // Yan listelerde uzun Türkçe mevki; yedek kulübesinde kısa kod (GK, RB, CM…).
  const pos = shortCode ? (player.pos_code ?? null) : positionLabel(player.position);
  const number = <span className={styles.compactNumber}>{player.shirt_number}</span>;
  const photo =
    player.photo && !photoFailed ? (
      <img
        src={player.photo}
        alt=""
        className={styles.compactPhoto}
        width={28}
        height={28}
        loading="lazy"
        onError={() => setPhotoFailed(true)}
      />
    ) : (
      <span className={`${styles.compactPhoto} ${styles.compactPhotoEmpty}`} aria-hidden="true" />
    );
  const text = (
    <span className={styles.compactText}>
      <span className={styles.compactName}>{player.name}</span>
      {pos ? <span className={styles.compactPos}>{pos}</span> : null}
    </span>
  );
  // İki listede de aynı düzen: [no][foto][metin]. Metin bloğu sola hizalı ve her satırda aynı x'ten başlar.
  return (
    <li>
      <Wrapper
        playerId={player.id}
        title={player.name}
        className={`${styles.compactRow} ${side === 'home' ? styles.compactRowHome : styles.compactRowAway}`}
      >
        {number}
        {photo}
        {text}
      </Wrapper>
    </li>
  );
}

/** `side`: sol liste (ev sahibi) sahaya yakın SAĞ kenara, sağ liste (deplasman) SOL kenara yaslanır. */
function CompactList({ players, bench = [], side }: { players: LineupPlayer[]; bench?: LineupPlayer[]; side: 'home' | 'away' }) {
  return (
    <ul className={styles.compactList}>
      {players.map((p) => (
        <CompactRow key={p.id} player={p} side={side} />
      ))}
      {bench.length > 0 ? (
        <>
          <li className={styles.compactBenchTitle} aria-hidden="true">Yedekler ({bench.length})</li>
          {sortBench(bench).map((p) => (
            <CompactRow key={p.id} player={p} side={side} shortCode />
          ))}
        </>
      ) : null}
    </ul>
  );
}

const sortBench = (players: LineupPlayer[]) =>
  [...players].sort((a, b) => (Number(a.shirt_number) || 999) - (Number(b.shirt_number) || 999));

/** Yedek kulübesi (yan listeler gizliyken — mobil/dar panel): pitch'in altında iki takım yan yana (dar alanda alt alta), forma numarasına göre; sade satır stili. */
function BenchList({ teamName, players, side }: { teamName: string; players: LineupPlayer[]; side: 'home' | 'away' }) {
  if (players.length === 0) return null;
  const sorted = sortBench(players);
  return (
    <div className={styles.benchTeam}>
      <div className={styles.benchTeamName}>
        {teamName} <span className={styles.benchCount}>({sorted.length})</span>
      </div>
      <ul className={styles.benchList}>
        {sorted.map((p) => (
          <CompactRow key={p.id} player={p} side={side} shortCode />
        ))}
      </ul>
    </div>
  );
}

function FormationRows({ rows, team }: { rows: LineupPlayer[][]; team: 'home' | 'away' }) {
  return (
    <div className={`${styles.formationHalf} ${team === 'home' ? styles.formationHalfHome : styles.formationHalfAway}`}>
      {rows.map((row, i) => (
        <div key={i} className={styles.formationRow}>
          {row.map((p) => (
            <PlayerToken key={p.id} player={p} team={team} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Lineup({ lineups, loading }: LineupProps) {
  if (loading) {
    return <LineupSkeleton />;
  }

  const homeData = lineups?.lineup?.home;
  const awayData = lineups?.lineup?.away;

  if (!homeData && !awayData) {
    return <div className={styles.empty}>Kadrolar henüz açıklanmadı.</div>;
  }

  const homePlayers: LineupPlayer[] = homeData?.players || [];
  const awayPlayers: LineupPlayer[] = awayData?.players || [];

  const homeStarters = homePlayers.filter((p) => p.substitution === '0');
  const awayStarters = awayPlayers.filter((p) => p.substitution === '0');

  const homeBench = homePlayers.filter((p) => p.substitution === '1');
  const awayBench = awayPlayers.filter((p) => p.substitution === '1');

  const homeLayout = buildFormationLayout(homeStarters);
  const awayLayout = buildFormationLayout(awayStarters);

  const homeTeamName = homeData?.team?.name || 'Ev Sahibi';
  const awayTeamName = awayData?.team?.name || 'Deplasman';
  const homeFormation = homeLayout.label;
  const awayFormation = awayLayout.label;
  // Deplasman takımı sahanın diğer ucundan dizilir: hatlar (ileri→geri) ve
  // sütunlar (sol↔sağ) 180° döner, böylece kanatlar sahada doğru tarafta kalır.
  const awayRows = [...awayLayout.rows].reverse().map((r) => (awayLayout.source === 'grid' ? [...r].reverse() : r));

  return (
    <div className={styles.lineupContainer}>
      <h3 className={styles.title}>İlk 11</h3>

      <div className={styles.layout}>
        <CompactList players={flattenRows(homeLayout.rows)} bench={homeBench} side="home" />

        <div className={styles.pitchCol}>
          <div className={styles.teamBar}>
            <span className={styles.teamBarName}>{homeTeamName}</span>
            {homeFormation && <span className={styles.formationBadge}>{homeFormation}</span>}
          </div>

          <div className={styles.pitch}>
            <div className={styles.pitchInner}>
              <div className={styles.penaltyAreaTop} />
              <div className={styles.penaltyAreaBottom} />
              <div className={styles.halfLine} />
              <div className={styles.centerCircle} />
            </div>

            <FormationRows rows={homeLayout.rows} team="home" />
            <FormationRows rows={awayRows} team="away" />
          </div>

          <div className={styles.teamBar}>
            <span className={styles.teamBarName}>{awayTeamName}</span>
            {awayFormation && <span className={styles.formationBadge}>{awayFormation}</span>}
          </div>
        </div>

        <CompactList players={flattenRows(awayLayout.rows)} bench={awayBench} side="away" />
      </div>

      {homeBench.length + awayBench.length > 0 ? (
        <section className={styles.bench} aria-labelledby="lineup-bench-title" data-testid="bench-bottom">
          <h3 id="lineup-bench-title" className={`${styles.title} ${styles.benchTitle}`}>Yedekler</h3>
          <div className={styles.benchGrid}>
            <BenchList teamName={homeTeamName} players={homeBench} side="home" />
            <BenchList teamName={awayTeamName} players={awayBench} side="away" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
