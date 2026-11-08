import { useState } from 'react';
import Link from 'next/link';
import type { LineupPlayer, MatchEvent, MatchLineupData } from '@/models/domain';
import { buildPlayerEvents, hasAnyEvent, type PlayerMatchEvents } from '@/utils/lineupPlayerEvents';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import LazyLoad from '@/components/LazyLoad';
import type { Match } from '@/models/liveScore';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import { isProbableLineup } from '@/utils/lineupStatus';
import { buildFormationLayout } from '@/utils/lineupFormation';
import { POSITION_LABEL_TR, positionLabel } from '@/utils/positionLabel';
import { formatRating } from '@/config/ratingScale';
import RatingBadge from '@/components/RatingBadge';
import LoadError from '@/components/LoadError';
import styles from './lineup.module.scss';

// Ekranın altında: sahne ve CSS'i ayrı parçada (ana sayfanın maç paneliyle ilk yüke girmesin). Kutu burada.
const loadFormationLoading = () => import('@/components/PitchScenes/FormationLoading');
import TeamLogo from '@/components/TeamLogo';

/** Sahadaki oyuncu dairesi (fotoğraf CSS ile daireyi doldurur) — istenen küçük sürümün boyutu. */
const FORMATION_PHOTO_PX = 40;

interface LineupProps {
  lineups: MatchLineupData | null;
  /** Maç olayları (aynı `fixtures/{id}` yanıtından): gol/asist/kart/değişiklik ikonları. Maç öncesi kullanılmaz. */
  events?: MatchEvent[] | null;
  loading?: boolean;
  /** Verilirse başlık (İlk 11 / Muhtemel 11) ve boş metin maçın evresine göre. */
  match?: Match | null;
  /** Yüklenemedi (hata ≠ kadro açıklanmadı): "yüklenemedi · tekrar dene". */
  error?: boolean;
  onRetry?: () => void;
}

/** Başlık + tahmini kadroda alt not ("Tahmini — resmî kadro açıklanınca güncellenir …"). */
function LineupTitle({ probable }: { probable: boolean }) {
  const { t } = useTranslation('matchState');
  return (
    <div className={styles.titleBlock}>
      <h3 className={styles.title}>{probable ? t('lineup.probable') : t('lineup.starting')}</h3>
      {probable ? <p className={styles.titleNote}>{t('lineup.probableNote')}</p> : null}
    </div>
  );
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

/**
 * Reyting rozeti metni: tek ondalık, yuvarlanmış (renk de bu değerden, bkz. `config/ratingScale`); geçersiz / ≤0 / eksikse
 * `null` (rozet hiç çizilmez — asla "0").
 */
export const formatPlayerRating = formatRating;

/** Oyuncu detay sayfasına (`/players/{id}`) bağlantı; id yoksa düz kutu. */
function Wrapper({
  playerId,
  className,
  title,
  ariaLabel,
  children,
}: {
  playerId?: string;
  className: string;
  title: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) {
  return playerId ? (
    <Link href={`/players/${playerId}`} className={className} title={title} aria-label={ariaLabel} prefetch={false}>
      {children}
    </Link>
  ) : (
    <div className={className} title={title} aria-label={ariaLabel} role={ariaLabel ? 'group' : undefined}>
      {children}
    </div>
  );
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** Ekran okuyucu etiketi: "Ad, kaptan, reyting 7.4, 1 gol, sarı kart, 67. dakikada oyundan çıktı". İkonlar aria-hidden. */
function playerAriaLabel(t: Translate, player: LineupPlayer, rating: string | null, ev?: PlayerMatchEvents): string {
  const parts = [player.name];
  if (player.captain) parts.push(t('lineup.captain'));
  if (rating) parts.push(t('lineup.a11y.rating', { value: rating }));
  if (ev) {
    if (ev.goals) parts.push(t('lineup.a11y.goals', { count: ev.goals }));
    if (ev.ownGoals) parts.push(t('lineup.a11y.ownGoals', { count: ev.ownGoals }));
    if (ev.assists) parts.push(t('lineup.a11y.assists', { count: ev.assists }));
    if (ev.secondYellow) parts.push(t('lineup.a11y.secondYellow'));
    else {
      if (ev.yellow) parts.push(t('lineup.a11y.yellow'));
      if (ev.red) parts.push(t('lineup.a11y.red'));
    }
    if (ev.subIn != null) parts.push(t('lineup.a11y.subIn', { minute: ev.subIn }));
    if (ev.subOut != null) parts.push(t('lineup.a11y.subOut', { minute: ev.subOut }));
  }
  return parts.join(', ');
}

function BallIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className={styles.evBall}>
      <circle cx="8" cy="8" r="7" fill="#fff" stroke="#1b1b1b" strokeWidth="1.2" />
      <path d="M8 5l2.6 1.9-1 3.1H6.4l-1-3.1z" fill="#1b1b1b" />
    </svg>
  );
}

/** Asist: yuvarlak içinde "A" (TR "asist" / EN "assist" ortak harf; 12px'te krampon silueti okunmuyordu). */
function AssistIcon() {
  return (
    <span className={styles.evAssist} aria-hidden="true">
      A
    </span>
  );
}

function SubArrow({ dir }: { dir: 'in' | 'out' }) {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true" className={dir === 'in' ? styles.evSubIn : styles.evSubOut}>
      {dir === 'in' ? <path d="M5 1.5L9 6H6.4v2.5H3.6V6H1z" fill="currentColor" /> : <path d="M5 8.5L1 4h2.6V1.5h2.8V4H9z" fill="currentColor" />}
    </svg>
  );
}

/** Gol (birden fazlaysa sayı) · asist · kart · çıktı/girdi dakikası. Hiç olay yoksa hiçbir şey çizilmez. */
function PlayerEventIcons({ ev, variant }: { ev?: PlayerMatchEvents; variant: 'pitch' | 'row' }) {
  if (!hasAnyEvent(ev)) return null;
  const e = ev!;
  return (
    <span className={`${styles.events} ${variant === 'pitch' ? styles.eventsPitch : styles.eventsRow}`} aria-hidden="true" data-testid="player-events">
      {e.goals > 0 ? (
        <span className={styles.evItem} data-ev="goal">
          <BallIcon />
          {e.goals > 1 ? <span className={styles.evCount}>{e.goals}</span> : null}
        </span>
      ) : null}
      {e.ownGoals > 0 ? (
        <span className={`${styles.evItem} ${styles.evOwnGoal}`} data-ev="own-goal">
          <BallIcon />
          {e.ownGoals > 1 ? <span className={styles.evCount}>{e.ownGoals}</span> : null}
        </span>
      ) : null}
      {e.assists > 0 ? (
        <span className={styles.evItem} data-ev="assist">
          <AssistIcon />
          {e.assists > 1 ? <span className={styles.evCount}>{e.assists}</span> : null}
        </span>
      ) : null}
      {e.secondYellow ? (
        <span className={`${styles.evItem} ${styles.evCardPair}`} data-ev="second-yellow">
          <i className={`${styles.evCard} ${styles.evCardYellow}`} />
          <i className={`${styles.evCard} ${styles.evCardRed}`} />
        </span>
      ) : (
        <>
          {e.yellow ? <i className={`${styles.evCard} ${styles.evCardYellow}`} data-ev="yellow" /> : null}
          {e.red ? <i className={`${styles.evCard} ${styles.evCardRed}`} data-ev="red" /> : null}
        </>
      )}
      {e.subIn != null ? (
        <span className={styles.evItem} data-ev="sub-in">
          <SubArrow dir="in" />
          <span className={styles.evMinute}>{e.subIn}&apos;</span>
        </span>
      ) : null}
      {e.subOut != null ? (
        <span className={styles.evItem} data-ev="sub-out">
          <SubArrow dir="out" />
          <span className={styles.evMinute}>{e.subOut}&apos;</span>
        </span>
      ) : null}
    </span>
  );
}

function PlayerToken({
  player,
  team,
  ev,
  showStats,
}: {
  player: LineupPlayer;
  team: 'home' | 'away';
  ev?: PlayerMatchEvents;
  showStats: boolean;
}) {
  const { t } = useTranslation('matchState');
  // CDN'de dosya yoksa / ağ hatasında forma numaralı daireye düşülür.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(player.photo) && !photoFailed;
  // Maç öncesi (muhtemel / açıklanmış ilk 11) puan ve olay yok — yalnız canlı / bitmiş maçta.
  const rating = showStats ? formatPlayerRating(player.rating) : null;
  const events = showStats ? ev : undefined;
  return (
    <Wrapper
      className={`${styles.formationPlayer} ${events?.subOut != null ? styles.formationPlayerOut : ''}`.trim()}
      title={player.name}
      playerId={player.id}
      ariaLabel={playerAriaLabel(t, player, rating, events)}
    >
      <span
        className={`${styles.formationDot} ${team === 'home' ? styles.formationDotHome : styles.formationDotAway} ${
          showPhoto ? styles.formationDotPhoto : ''
        }`.trim()}
      >
        {showPhoto ? (
          <TeamLogo
            src={player.photo}
            className={styles.formationPhoto}
            width={FORMATION_PHOTO_PX}
            onFail={() => setPhotoFailed(true)}
          />
        ) : (
          player.shirt_number
        )}
        {rating ? <RatingBadge rating={player.rating} size="xs" className={styles.ratingBadge} data-testid="player-rating" /> : null}
        {player.captain ? (
          <span className={styles.captainBadge} data-testid="player-captain" aria-hidden="true">
            C
          </span>
        ) : null}
        {player.nationality?.flag ? (
          <TeamLogo
            src={player.nationality.flag}
            title={player.nationality.name}
            className={styles.flagBadge}
            data-testid="player-flag"
            width={16}
            height={12}
          />
        ) : null}
      </span>
      <span className={styles.formationName}>{shortName(player.name)}</span>
      {player.pos_code ? <span className={styles.formationPos} data-testid="player-pos">{player.pos_code}</span> : null}
      <PlayerEventIcons ev={events} variant="pitch" />
    </Wrapper>
  );
}

export { POSITION_LABEL_TR, positionLabel };

function CompactRow({ player, side, ev, showStats }: { player: LineupPlayer; side: 'home' | 'away'; ev?: PlayerMatchEvents; showStats: boolean }) {
  const { t } = useTranslation('matchState');
  // Foto yüklenemezse (CDN/ağ) avatar yerine nötr daire — sahadaki ikonlarla aynı fallback mantığı.
  const [photoFailed, setPhotoFailed] = useState(false);
  // Yedek kulübesinde kısa kod (GK, RB, CM…).
  const pos = player.pos_code ?? null;
  const number = <span className={styles.compactNumber}>{player.shirt_number}</span>;
  const photo =
    player.photo && !photoFailed ? (
      <TeamLogo src={player.photo} className={styles.compactPhoto} width={28} height={28} onFail={() => setPhotoFailed(true)} />
    ) : (
      <span className={`${styles.compactPhoto} ${styles.compactPhotoEmpty}`} aria-hidden="true" />
    );
  const rating = showStats ? formatPlayerRating(player.rating) : null;
  const events = showStats ? ev : undefined;
  const text = (
    <span className={styles.compactText}>
      <span className={styles.compactName}>{player.name}</span>
      <span className={styles.compactMeta}>
        {pos ? <span className={styles.compactPos}>{pos}</span> : null}
        <PlayerEventIcons ev={events} variant="row" />
      </span>
    </span>
  );
  // [no][foto][metin][reyting]: metin bloğu her satırda aynı x'ten başlar.
  return (
    <li>
      <Wrapper
        playerId={player.id}
        title={player.name}
        ariaLabel={playerAriaLabel(t, player, rating, events)}
        className={`${styles.compactRow} ${side === 'home' ? styles.compactRowHome : styles.compactRowAway}`}
      >
        {number}
        {photo}
        {text}
        {rating ? <RatingBadge rating={player.rating} size="sm" data-testid="compact-rating" /> : null}
      </Wrapper>
    </li>
  );
}

const sortBench = (players: LineupPlayer[]) =>
  [...players].sort((a, b) => (Number(a.shirt_number) || 999) - (Number(b.shirt_number) || 999));

/**
 * Yedek kulübesi (sahanın altında): iki takım yan yana (dar alanda alt alta). Oyuna girenler önce (giriş dakikasına
 * göre), sonra forma numarasına göre.
 */
function BenchList({
  teamName,
  players,
  side,
  eventsById,
  showStats,
}: {
  teamName: string;
  players: LineupPlayer[];
  side: 'home' | 'away';
  eventsById: Map<string, PlayerMatchEvents>;
  showStats: boolean;
}) {
  if (players.length === 0) return null;
  const subIn = (p: LineupPlayer) => (showStats ? eventsById.get(p.id)?.subIn : undefined) ?? Number.POSITIVE_INFINITY;
  const sorted = sortBench(players).sort((a, b) => subIn(a) - subIn(b));
  return (
    <div className={styles.benchTeam}>
      <div className={styles.benchTeamName}>
        {teamName} <span className={styles.benchCount}>({sorted.length})</span>
      </div>
      <ul className={styles.benchList}>
        {sorted.map((p) => (
          <CompactRow key={p.id} player={p} side={side} ev={eventsById.get(p.id)} showStats={showStats} />
        ))}
      </ul>
    </div>
  );
}

function FormationRows({
  rows,
  team,
  eventsById,
  showStats,
}: {
  rows: LineupPlayer[][];
  team: 'home' | 'away';
  eventsById: Map<string, PlayerMatchEvents>;
  showStats: boolean;
}) {
  return (
    <div className={`${styles.formationHalf} ${team === 'home' ? styles.formationHalfHome : styles.formationHalfAway}`}>
      {rows.map((row, i) => (
        <div key={i} className={styles.formationRow}>
          {row.map((p) => (
            <PlayerToken key={p.id} player={p} team={team} ev={eventsById.get(p.id)} showStats={showStats} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Takım çubuğu: isim + formasyon rozeti. Yatay sahada ikisi tek satırda (ev solda, deplasman sağda). */
function TeamBar({ name, formation, side, placeholder }: { name: string; formation: string | null; side: 'home' | 'away'; placeholder?: boolean }) {
  return (
    <div
      className={`${styles.teamBar} ${side === 'home' ? styles.teamBarHome : styles.teamBarAway} ${placeholder ? styles.teamBarPlaceholder : ''}`.trim()}
      aria-hidden={placeholder ? 'true' : undefined}
    >
      <span className={`${styles.teamDot} ${side === 'home' ? styles.teamDotHome : styles.teamDotAway}`} aria-hidden="true" />
      <span className={styles.teamBarName}>{name}</span>
      {formation ? <span className={styles.formationBadge}>{formation}</span> : null}
    </div>
  );
}

function PitchMarkings() {
  return (
    <div className={styles.pitchInner} aria-hidden="true">
      <div className={styles.penaltyAreaTop} />
      <div className={styles.penaltyAreaBottom} />
      <div className={styles.halfLine} />
      <div className={styles.centerCircle} />
    </div>
  );
}

/**
 * Yüklenirken 02 · Diziliş animasyonu, gerçek kadro alanıyla AYNI kutuda: başlık + takım çubukları + saha kutusu
 * (aynı min-height/kenarlık/padding; dikey/yatay aynı container kuralı) → içerik gelince yükseklik değişmez.
 */
function LineupLoading({ probable }: { probable: boolean }) {
  const { t } = useTranslation('common');
  return (
    <div className={styles.lineupContainer}>
      <LineupTitle probable={probable} />
      <div className={styles.pitchWrap}>
        <div className={styles.pitchCol}>
          <TeamBar name={'\u00a0'} formation="4-4-2" side="home" placeholder />
          <div className={styles.loadingPitch}>
            <LazyLoad load={loadFormationLoading} props={{ label: t('loading') }} />
          </div>
          <TeamBar name={'\u00a0'} formation="4-4-2" side="away" placeholder />
        </div>
      </div>
    </div>
  );
}

export default function Lineup({ lineups, events, loading, match, error, onRetry }: LineupProps) {
  const { t } = useTranslation('matchState');
  const state = match ? matchDisplayState(match) : null;
  const phase = state?.phase ?? 'POST';

  if (loading) {
    // Başlamamış maçta kadro çoğunlukla tahmini: başlık + not baştan (gelince kutu büyümesin).
    return <LineupLoading probable={phase === 'PRE'} />;
  }

  const homeData = lineups?.lineup?.home;
  const awayData = lineups?.lineup?.away;

  if (!homeData && !awayData) {
    // Ertelendi / iptal / tarih belirsiz / gecikti: istatistik ve olay kartları durumu zaten söylüyor → tekrar etme.
    if (state?.special && !specialKeepsData(state.special)) return null;
    if (error) return <LoadError onRetry={onRetry} />;
    return (
      <div className={styles.empty}>
        {!state
          ? t('lineup.notAnnounced')
          : phase === 'PRE'
            ? `${t('lineup.notAnnounced')} ${t('lineup.announceNote')}`
            : phase === 'POST'
              ? t('post.lineups')
              : t('lineup.notAnnounced')}
      </div>
    );
  }

  const probable = lineups ? isProbableLineup(lineups, phase) : false;
  // Puan rozeti + olay ikonları yalnız canlı / bitmiş maçta (muhtemel 11 ve maç öncesi resmî kadroda yok).
  const showStats = phase !== 'PRE' && !probable;
  const eventsById = showStats ? buildPlayerEvents(events) : new Map<string, PlayerMatchEvents>();

  const homePlayers: LineupPlayer[] = homeData?.players || [];
  const awayPlayers: LineupPlayer[] = awayData?.players || [];

  const homeStarters = homePlayers.filter((p) => p.substitution === '0');
  const awayStarters = awayPlayers.filter((p) => p.substitution === '0');

  const homeBench = homePlayers.filter((p) => p.substitution === '1');
  const awayBench = awayPlayers.filter((p) => p.substitution === '1');

  const homeLayout = buildFormationLayout(homeStarters);
  const awayLayout = buildFormationLayout(awayStarters);

  const homeTeamName = homeData?.team?.name || t('lineup.home');
  const awayTeamName = awayData?.team?.name || t('lineup.away');
  // Deplasman takımı sahanın diğer ucundan dizilir: yalnız hatlar (ileri→geri) ters. Sütunlar ÇEVRİLMEZ: Sportmonks
  // `formation_field` sütunu iki takımda ORTAK ekran çerçevesinde (ev 2:1 = sağ bek, deplasman 2:1 = sol bek; FB-BJK
  // 19746621 ve Kasımpaşa-Konyaspor 19746608'de doğrulandı) → aynı sırayla dizince iki takımın kanatları da doğru.
  // DOM sırası iki yönde de aynı (yatayda CSS hatları sütuna çevirir).
  const awayRows = [...awayLayout.rows].reverse();

  return (
    <div className={styles.lineupContainer}>
      <LineupTitle probable={probable} />

      <div className={styles.pitchWrap}>
        <div className={styles.pitchCol}>
          <TeamBar name={homeTeamName} formation={homeLayout.label} side="home" />
          <div className={styles.pitch} data-testid="lineup-pitch">
            <PitchMarkings />
            <FormationRows rows={homeLayout.rows} team="home" eventsById={eventsById} showStats={showStats} />
            <FormationRows rows={awayRows} team="away" eventsById={eventsById} showStats={showStats} />
          </div>
          <TeamBar name={awayTeamName} formation={awayLayout.label} side="away" />
        </div>
      </div>

      {homeBench.length + awayBench.length > 0 ? (
        <section className={styles.bench} aria-labelledby="lineup-bench-title" data-testid="bench-bottom">
          <h3 id="lineup-bench-title" className={`${styles.title} ${styles.benchTitle}`}>{t('lineup.bench')}</h3>
          <div className={styles.benchGrid}>
            <BenchList teamName={homeTeamName} players={homeBench} side="home" eventsById={eventsById} showStats={showStats} />
            <BenchList teamName={awayTeamName} players={awayBench} side="away" eventsById={eventsById} showStats={showStats} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
