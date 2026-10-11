import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from '@/lib/i18n';
import { narrowTeamName } from '@/components/MatchList/TeamNameLabel';
import type { Match } from '@/models/liveScore';
import { buildMatchHref } from '@/utils/matchUrl';
import { isModifiedClick } from '@/utils/matchSelection';
import styles from './liveTicker.module.scss';

/** Bir maçın ekranda kalma süresi; geçiş (CSS) ~300 ms. */
export const LIVE_TICKER_ROTATE_MS = 4000;

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export type LiveTickerProps = {
  /** Canlı maçlar, gösterim sırasıyla (bkz. `utils/liveTicker.ts`). Boşsa hiçbir şey çizilmez. */
  matches: Match[];
  /** Split-view'da maç detay paneli (verilmezse bağlantı maç sayfasına gider — mobil). */
  onSelectMatch?: (match: Match) => void;
  onPrefetchMatch?: (matchId: string) => void;
};

function scoreParts(m: Match): [string, string] {
  const raw = (m.scores?.score || m.score || '').replace(/\s+/g, '');
  const [h, a] = raw.split(/[-–]/);
  return [h || '0', a || '0'];
}

export type TickerChoice = 'auto' | 'paused' | 'playing';

/** Kendiliğinden dönüş kapalı mı: kullanıcı durdurduysa ya da (seçim yokken) hareket azaltılmışsa. */
export function tickerStopped(choice: TickerChoice, reducedMotion: boolean): boolean {
  return choice === 'paused' || (choice === 'auto' && reducedMotion);
}

/** Gösterilecek maç: id'si listede olan; yoksa (maç bitti / ilk çizim) ilk maç. */
export function tickerCurrent(matches: readonly Match[], id: string | null): Match | undefined {
  return matches.find((m) => String(m.id) === id) ?? matches[0];
}

/** Sıradaki maçın id'si (sondan başa döner). Liste sırası poll ile değişse de gösterilenin ardındaki gelir. */
export function tickerNextId(matches: readonly Match[], currentId: string | null): string | null {
  if (matches.length === 0) return null;
  const at = matches.findIndex((m) => String(m.id) === currentId);
  return String(matches[(at + 1) % matches.length]!.id);
}

const shortName = (team: Match['home']) => {
  const name = team?.name || '';
  return narrowTeamName(team?.id, name) ?? name;
};

/** Satırın görünen içeriği (dakika · ev · skor · deplasman) — bağlantı ve çıkış kopyası aynı düzende. */
function ItemBody({ match }: { match: Match }) {
  const { t } = useTranslation('match');
  const minute = (match.time || '').replace(/'$/u, '').trim();
  const [hs, as] = scoreParts(match);
  return (
    <>
      <span className={styles.minute}>
        {match.status === 'HALF TIME BREAK' ? t('halfTime') : minute ? `${minute}'` : t('liveTicker.liveShort')}
      </span>
      <span className={styles.home} title={match.home?.name}>
        {shortName(match.home)}
      </span>
      <span className={styles.score}>
        {hs}–{as}
      </span>
      <span className={styles.away} title={match.away?.name}>
        {shortName(match.away)}
      </span>
    </>
  );
}

/**
 * Lig filtre satırındaki tek satırlık canlı maç ticker'ı: her `LIVE_TICKER_ROTATE_MS`'de bir sonraki canlı maça
 * kayarak geçer (~300 ms). Fare üstündeyken, odak içerideyken ve dokunurken durur; duraklat/sürdür düğmesi var
 * (WCAG 2.2.2). `prefers-reduced-motion`'da kendiliğinden dönmez (düğmeyle başlatılırsa geçiş animasyonsuz).
 * Yükseklik sabit (CSS); maç yoksa hiç çizilmez. Veri sayfanın mevcut canlı listesinden gelir (yeni istek yok).
 */
export default function LiveTicker({ matches, onSelectMatch, onPrefetchMatch }: LiveTickerProps) {
  const { t } = useTranslation('match');
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
  // Kullanıcının düğme seçimi; 'auto' = hareket tercihine göre (azaltılmışsa durur).
  const [choice, setChoice] = useState<TickerChoice>('auto');
  const [hover, setHover] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const [touching, setTouching] = useState(false);
  // Gösterilen maç id ile izlenir: poll listeyi yenileyince (sıra / içerik değişse de) aynı maçta kalır.
  const [view, setView] = useState<{ id: string | null; prevId: string | null }>({ id: null, prevId: null });

  const current = tickerCurrent(matches, view.id);
  const prev = view.prevId != null && view.prevId !== String(current?.id) ? matches.find((m) => String(m.id) === view.prevId) : undefined;
  const currentIndex = current ? matches.indexOf(current) : -1;

  const stopped = tickerStopped(choice, reducedMotion);
  const paused = stopped || hover || focusInside || touching;
  const canRotate = matches.length > 1;

  const matchesRef = useRef(matches);
  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  const currentId = current ? String(current.id) : null;
  useEffect(() => {
    if (paused || !canRotate || currentId == null) return;
    const timer = window.setTimeout(() => {
      const next = tickerNextId(matchesRef.current, currentId);
      if (next != null) setView({ id: next, prevId: currentId });
    }, LIVE_TICKER_ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [paused, canRotate, currentId]);

  if (!current) return null;

  const [hs, as] = scoreParts(current);
  const id = String(current.id);
  return (
    <div
      className={styles.ticker}
      role="region"
      aria-label={t('liveTicker.label')}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(false)}
      onPointerDown={(e) => e.pointerType !== 'mouse' && setTouching(true)}
      onPointerUp={() => setTouching(false)}
      onPointerCancel={() => setTouching(false)}
      onFocus={() => setFocusInside(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusInside(false);
      }}
    >
      <span className={styles.badge}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.badgeText}>{t('liveTicker.liveShort')}</span>
      </span>
      <div className={styles.viewport}>
        {prev ? (
          <span key={`out-${prev.id}`} className={`${styles.item} ${styles.itemOut}`} aria-hidden="true">
            <ItemBody match={prev} />
          </span>
        ) : null}
        <Link
          key={id}
          href={buildMatchHref(current)}
          prefetch={false}
          className={`${styles.item} ${prev ? styles.itemIn : ''}`.trim()}
          aria-label={t('liveTicker.itemLabel', {
            home: current.home?.name || '',
            away: current.away?.name || '',
            score: `${hs}-${as}`,
            minute: current.status === 'HALF TIME BREAK' ? t('halfTime') : current.time || t('liveTicker.liveShort'),
          })}
          onMouseEnter={onPrefetchMatch ? () => onPrefetchMatch(id) : undefined}
          onFocus={onPrefetchMatch ? () => onPrefetchMatch(id) : undefined}
          onClick={
            onSelectMatch
              ? (e) => {
                  if (isModifiedClick(e)) return;
                  e.preventDefault();
                  onPrefetchMatch?.(id);
                  onSelectMatch(current);
                }
              : undefined
          }
        >
          <ItemBody match={current} />
        </Link>
      </div>
      {canRotate ? (
        <>
          <span className={styles.count} aria-hidden="true">
            {currentIndex + 1}/{matches.length}
          </span>
          <button
            type="button"
            className={styles.toggle}
            aria-label={stopped ? t('liveTicker.resume') : t('liveTicker.pause')}
            onClick={() => setChoice(stopped ? 'playing' : 'paused')}
          >
            {stopped ? (
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
                <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
              </svg>
            )}
          </button>
        </>
      ) : null}
    </div>
  );
}
