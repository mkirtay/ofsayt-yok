import Link from 'next/link';
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { isModifiedClick } from '@/utils/matchSelection';
import { BOTTOM_STACK_ATTR } from '@/hooks/useBottomStackSlot';
import {
  dismissGoalToast,
  EMPTY_GOAL_TOAST_QUEUE,
  enqueueGoalToasts,
  goalToastVisibleLimit,
  visibleFraction,
  type GoalToastItem,
  type GoalToastQueue,
} from '@/utils/goalToast';
import styles from './goalToast.module.scss';

/** Bir bildirimin ekranda kalma süresi (üstüne gelince / odaklanınca durur). */
export const GOAL_TOAST_MS = 5000;

/** MatchList'in bir yenilemede bulduğu goller; `seq` her yeni partide artar (aynı parti iki kez işlenmez). */
export type GoalToastBatch = { seq: number; items: GoalToastItem[] };

export type GoalToastsProps = {
  batch: GoalToastBatch;
  /** Bildirim üretilebilir mi (sekme görünür, açılış / dönüş sonrası bekleme bitti) — bkz. `goalToastsArmed`. */
  armed: () => boolean;
  /** Split-view: verilirse tıklama sayfa geçişi yerine maçı yan panelde açar (liste satırıyla aynı davranış). */
  onSelectMatch?: ((matchId: string) => void) | null;
  /** Yan panelde açık maç: kendisi zaten görünür, bildirim yok. */
  selectedMatchId?: string | null;
};

type Action = { type: 'add'; items: GoalToastItem[] } | { type: 'dismiss'; key: string } | { type: 'clear' };

function reducer(state: GoalToastQueue, action: Action): GoalToastQueue {
  if (action.type === 'add') return enqueueGoalToasts(state, action.items);
  if (action.type === 'dismiss') return dismissGoalToast(state, action.key);
  return state.visible.length || state.queued.length ? EMPTY_GOAL_TOAST_QUEUE : state;
}

const noopSubscribe = () => () => {};

/** Mobil düzen (`below-desktop`, < 1024 px) ve alt yığında üye ol kartı açık → ekran kalabalık. */
const CROWDED_QUERY = '(max-width: 1023px)';
function subscribeCrowded(onChange: () => void): () => void {
  const mql = window.matchMedia(CROWDED_QUERY);
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: [BOTTOM_STACK_ATTR] });
  mql.addEventListener('change', onChange);
  return () => {
    mo.disconnect();
    mql.removeEventListener('change', onChange);
  };
}
const readCrowded = () =>
  document.documentElement.hasAttribute(BOTTOM_STACK_ATTR) && window.matchMedia(CROWDED_QUERY).matches;
const appRoot = () => document.querySelector<HTMLElement>('[data-app-root]') ?? document.body;

/** Listede satırı görünüm alanında olan maç (yarısından fazlası görünüyorsa) — kart zaten "gol anı"nı oynatıyor. */
function rowIsOnScreen(matchId: string): boolean {
  const row = document.querySelector<HTMLElement>(`[data-goal-row="${CSS.escape(matchId)}"]`);
  if (!row) return false; // sanal listede çizilmemiş = ekran dışı
  const box = row.closest<HTMLElement>('[data-goal-list]');
  return visibleFraction(row.getBoundingClientRect(), box ? box.getBoundingClientRect() : null, window.innerHeight) > 0.5;
}

/**
 * Ekran dışındaki maçta gol bildirimi (alt orta; mobilde alt menünün üstünde, sağdaki yüzen düğmelere yer bırakır).
 * En fazla 2 bildirim üst üste, kalanı sırada. Canlı bölge `aria-live="polite"` bileşen yüklenince boş olarak DOM'a
 * girer; bildirimler bir sonraki karede eklenir → ekran okuyucu ilkini de duyurur. Sekme gizlenince hepsi silinir.
 * `MatchList` yalnız ilk golde tembel yükler (ana sayfa ilk yüküne JS/CSS eklemez).
 */
export default function GoalToasts({ batch, armed, onSelectMatch = null, selectedMatchId = null }: GoalToastsProps) {
  const { t } = useTranslation('match');
  const [state, dispatch] = useReducer(reducer, EMPTY_GOAL_TOAST_QUEUE);
  const seen = useRef(new Set<string>());
  const handledSeq = useRef(-1);
  // Yalnız istemcide yüklenir (tembel); sunucu dalı yine de güvenli.
  const root = useSyncExternalStore(noopSubscribe, appRoot, () => null);
  // Kalabalıkta tek bildirim: ikincisi çizilmez (süresi de işlemez), birincisi kapanınca sırayla gelir.
  const crowded = useSyncExternalStore(subscribeCrowded, readCrowded, () => false);
  const shown = state.visible.slice(0, goalToastVisibleLimit(crowded));

  useEffect(() => {
    if (!root || batch.seq === handledSeq.current) return;
    handledSeq.current = batch.seq;
    const ok = armed();
    const fresh = batch.items.filter((item) => {
      if (seen.current.has(item.key)) return false;
      seen.current.add(item.key);
      return ok && item.matchId !== selectedMatchId && !rowIsOnScreen(item.matchId);
    });
    if (fresh.length) dispatch({ type: 'add', items: fresh });
  }, [batch, root, armed, selectedMatchId]);

  // Sekme görünmezken biriktirme: gizlenince bekleyenler ve görünenler silinir.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) dispatch({ type: 'clear' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const dismiss = useCallback((key: string) => dispatch({ type: 'dismiss', key }), []);

  if (!root) return null;
  return createPortal(
    <div className={styles.region} role="status" aria-live="polite" aria-relevant="additions text">
      {shown.map((item) => (
        <GoalToastCard
          key={item.matchId}
          item={item}
          goalLabel={t('list.goalToast.goal')}
          closeLabel={t('list.goalToast.close')}
          scorerLabel={t('list.goalToast.scored', { team: item.side === 'home' ? item.home.name : item.away.name })}
          onDismiss={dismiss}
          onSelectMatch={onSelectMatch}
        />
      ))}
    </div>,
    root,
  );
}

export function GoalToastCard({
  item,
  goalLabel,
  closeLabel,
  scorerLabel,
  onDismiss,
  onSelectMatch = null,
  duration = GOAL_TOAST_MS,
}: {
  item: GoalToastItem;
  goalLabel: string;
  closeLabel: string;
  scorerLabel: string;
  onDismiss: (key: string) => void;
  onSelectMatch?: ((matchId: string) => void) | null;
  /** 0 = kendiliğinden kapanmaz (yalnız ekran görüntüsü / test). */
  duration?: number;
}) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  // Aynı maçın yeni golü kartı yerinde günceller → süre baştan.
  useEffect(() => {
    remaining.current = duration;
  }, [item.key, duration]);

  useEffect(() => {
    if (paused || duration <= 0) return;
    startedAt.current = Date.now();
    const timer = window.setTimeout(() => onDismiss(item.key), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, item.key, duration, onDismiss]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (onSelectMatch && !isModifiedClick(e)) {
      e.preventDefault();
      onSelectMatch(item.matchId);
    }
    onDismiss(item.key);
  };

  const homeScored = item.side === 'home';
  return (
    <div
      className={styles.toast}
      data-paused={paused ? '' : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Link href={item.href} prefetch={false} className={styles.body} onClick={onClick}>
        <span className={styles.head}>
          <span className={styles.ball} aria-hidden="true">
            ⚽
          </span>
          <span className={styles.goal}>{goalLabel}</span>
          {item.minute ? <span className={styles.minute}>{item.minute}</span> : null}
          <span className={styles.srOnly}>{scorerLabel}.</span>
        </span>
        <span className={styles.line}>
          <span className={`${styles.team} ${styles.home}`} data-scorer={homeScored ? '' : undefined}>
            <span className={styles.name}>{item.home.name}</span>
            <TeamLogo src={item.home.logo} width={20} className={styles.logo} />
          </span>
          <span className={styles.score}>
            <span data-scorer={homeScored ? '' : undefined}>{item.score[0]}</span>
            <span aria-hidden="true">-</span>
            <span className={styles.srOnly}> </span>
            <span data-scorer={homeScored ? undefined : ''}>{item.score[1]}</span>
          </span>
          <span className={`${styles.team} ${styles.away}`} data-scorer={homeScored ? undefined : ''}>
            <TeamLogo src={item.away.logo} width={20} className={styles.logo} />
            <span className={styles.name}>{item.away.name}</span>
          </span>
        </span>
      </Link>
      <button type="button" className={styles.close} onClick={() => onDismiss(item.key)} aria-label={closeLabel} title={closeLabel}>
        <span aria-hidden="true">×</span>
      </button>
      {duration > 0 ? (
        <span key={item.key} className={styles.timer} style={{ animationDuration: `${duration}ms` }} aria-hidden="true" />
      ) : null}
    </div>
  );
}
