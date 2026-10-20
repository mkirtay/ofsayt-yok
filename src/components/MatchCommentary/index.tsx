import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { PanelSkeleton } from '@/components/Skeleton';
import LoadError from '@/components/LoadError';
import MatchStateNote from '@/components/MatchStateNote';
import type { Match } from '@/models/liveScore';
import type { CommentaryItem, CommentaryKind } from '@/services/sportmonks/matchCommentary';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import styles from './matchCommentary.module.scss';

/** Canlı maçta yenileme aralığı — sunucu kaydı da 60 sn taze (cachePolicy COMMENTARY_LIVE_TTL). */
export const COMMENTARY_REFRESH_MS = 60_000;

export type CommentaryFilter = 'all' | 'goals' | 'cards' | 'shots' | 'substitutions' | 'important';

const FILTERS: readonly CommentaryFilter[] = ['all', 'goals', 'cards', 'shots', 'substitutions', 'important'];

const FILTER_KIND: Partial<Record<CommentaryFilter, CommentaryKind>> = {
  goals: 'goal',
  cards: 'card',
  shots: 'shot',
  substitutions: 'substitution',
};

export function matchesFilter(item: CommentaryItem, filter: CommentaryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'important') return item.important;
  return item.kind === FILTER_KIND[filter];
}

/** "90+4" / "45" / dakikasız satır (başlama, devre sonu) için null. */
export function minuteLabel(item: Pick<CommentaryItem, 'minute' | 'extraMinute'>): string | null {
  if (item.minute == null) return null;
  return item.extraMinute ? `${item.minute}+${item.extraMinute}` : String(item.minute);
}

const isRed = (item: CommentaryItem) => /\bred card\b|sent off|second yellow/i.test(item.en);

function KindIcon({ item }: { item: CommentaryItem }): ReactNode {
  const svg = (children: ReactNode) => (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
  switch (item.kind) {
    case 'goal':
      return svg(
        <>
          <circle cx="8" cy="8" r="6.4" />
          <path d="M8 5.3l2.5 1.8-.95 2.95h-3.1L5.5 7.1z" fill="currentColor" />
        </>,
      );
    case 'card':
      return <i className={`${styles.card} ${isRed(item) ? styles.cardRed : styles.cardYellow}`} aria-hidden="true" />;
    case 'shot':
      return svg(
        <>
          <circle cx="4.5" cy="11.5" r="2.3" />
          <path d="M7.5 8.5L14 2M10.5 2H14v3.5" />
        </>,
      );
    case 'corner':
      return svg(<path d="M3 14V2l8 3-8 3" />);
    case 'offside':
      return svg(<path d="M3 14V2l8 3-8 3M10 11h4" />);
    case 'substitution':
      return svg(
        <>
          <path d="M3 5.5h9M9.5 3l2.5 2.5L9.5 8" />
          <path d="M13 10.5H4M6.5 8L4 10.5 6.5 13" />
        </>,
      );
    case 'var':
      return svg(
        <>
          <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
          <path d="M8 11.5v2.5M5 14h6" />
        </>,
      );
    default:
      return svg(
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.8V8l2 1.6" />
        </>,
      );
  }
}

type ViewProps = {
  items: readonly CommentaryItem[];
  live: boolean;
  filter: CommentaryFilter;
  onFilter: (f: CommentaryFilter) => void;
  locale: string;
};

/** Dolu anlatım: filtre çipleri (sayılarıyla) + satırlar. Saf — durum/veri `MatchCommentary`'de. */
export function CommentaryView({ items, live, filter, onFilter, locale }: ViewProps) {
  const { t } = useTranslation('match');
  const counts = useMemo(() => {
    const c = {} as Record<CommentaryFilter, number>;
    for (const f of FILTERS) c[f] = items.filter((i) => matchesFilter(i, f)).length;
    return c;
  }, [items]);
  const visible = useMemo(() => items.filter((i) => matchesFilter(i, filter)), [items, filter]);
  const title = <h3 className={styles.title}>{t('commentary.title')}</h3>;

  return (
    <section className={styles.root}>
      <div className={styles.head}>
        {title}
        {live ? <span className={styles.liveNote}>{t('commentary.liveNote')}</span> : null}
      </div>
      <div className={styles.filters} role="group" aria-label={t('commentary.filtersLabel')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.chip} ${filter === f ? styles.chipActive : ''}`.trim()}
            aria-pressed={filter === f}
            onClick={() => onFilter(f)}
          >
            {t(`commentary.filters.${f}`)}
            {f !== 'all' ? <span className={styles.count}>{counts[f]}</span> : null}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className={styles.empty}>{t('commentary.emptyFilter')}</p>
      ) : (
        <ol className={styles.list}>
          {visible.map((item) => {
            const minute = minuteLabel(item);
            const tr = locale === 'tr' ? item.tr : null;
            const kindLabel = item.kind === 'card' && isRed(item) ? t('commentary.kinds.redCard') : t(`commentary.kinds.${item.kind}`);
            return (
              <li
                key={item.id}
                className={[styles.row, item.important ? styles.important : '', item.kind === 'goal' ? styles.goal : ''].filter(Boolean).join(' ')}
              >
                <span className={styles.minute}>
                  {minute ? (
                    <>
                      {minute}
                      <span className={styles.srOnly}>{t('commentary.minuteSuffix')}</span>
                    </>
                  ) : (
                    <span aria-hidden="true">·</span>
                  )}
                </span>
                <div className={styles.body}>
                  <span className={`${styles.kind} ${styles[`kind_${item.kind}`] ?? ''}`.trim()}>
                    <span className={styles.icon}>
                      <KindIcon item={item} />
                    </span>
                    {kindLabel}
                  </span>
                  {tr ? <p className={styles.text}>{tr}</p> : <p className={styles.text} lang="en">{item.en}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** 404 (maç yok) = boş anlatım; diğer başarısız yanıtlar fırlatır (hata ≠ veri yok). */
async function fetchCommentary(matchId: string, signal?: AbortSignal): Promise<{ items: CommentaryItem[]; live: boolean }> {
  const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/commentary`, { signal });
  if (res.status === 404) return { items: [], live: false };
  if (!res.ok) throw new Error(`commentary ${res.status}`);
  const body = (await res.json()) as { items?: CommentaryItem[]; live?: boolean };
  return { items: Array.isArray(body.items) ? body.items : [], live: !!body.live };
}

type Props = {
  matchId: string;
  match: Match | null;
};

type Status = 'loading' | 'ready' | 'error';

/**
 * Maç detayı "Anlatım" sekmesi — Sportmonks anlatım satırları (en yeni üstte) + tür filtreleri. Veri sekme açılınca
 * `/api/matches/[id]/commentary`'den (SSR'a girmez); canlı maçta 60 sn'de bir, sekme görünürken yenilenir. TR'de kural
 * tabanlı çeviri, tanınmayan cümle İngilizce (`lang="en"`). Hata ≠ veri yok: yüklenemezse "tekrar dene".
 */
export default function MatchCommentary({ matchId, match }: Props) {
  const { t } = useTranslation('match');
  const { t: ts } = useTranslation('matchState');
  const { locale } = useI18n();
  const state = match ? matchDisplayState(match) : null;
  const blockingSpecial = state?.special && !specialKeepsData(state.special) ? state.special : null;
  const skip = state?.phase === 'PRE' || !!blockingSpecial;

  const [items, setItems] = useState<CommentaryItem[]>([]);
  const [live, setLive] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [filter, setFilter] = useState<CommentaryFilter>('all');
  const hasData = useRef(false);

  // Sonuç durumu fetch'ten SONRA (then) uygulanır; hata: ilk yüklemede "yüklenemedi", canlı yenilemede eldeki satırlar kalır.
  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchCommentary(matchId, signal).then(
        (data) => {
          hasData.current = true;
          setItems(data.items);
          setLive(data.live);
          setStatus('ready');
        },
        (e: unknown) => {
          if ((e as Error)?.name !== 'AbortError' && !hasData.current) setStatus('error');
        },
      ),
    [matchId],
  );

  useEffect(() => {
    if (skip) return;
    // İlk durum zaten 'loading'; maç değişince bileşen yeniden kurulur (MatchDetailContent `key={matchId}`).
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load, skip]);

  // Canlı: sekme görünürken dakikada bir.
  const phaseLive = state?.phase === 'LIVE' || state?.phase === 'HT';
  useEffect(() => {
    if (skip || !(live || phaseLive)) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, COMMENTARY_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [skip, live, phaseLive, load]);

  const title = <h3 className={styles.title}>{t('commentary.title')}</h3>;

  if (blockingSpecial) {
    return (
      <section className={styles.root}>
        {title}
        <MatchStateNote special={blockingSpecial} variant="message" />
      </section>
    );
  }
  if (state?.phase === 'PRE') {
    return (
      <section className={styles.root}>
        {title}
        <p className={styles.empty}>{t('commentary.pre')}</p>
      </section>
    );
  }
  if (status === 'loading') return <PanelSkeleton rows={6} />;
  if (status === 'error') {
    return (
      <section className={styles.root}>
        {title}
        <LoadError
          onRetry={() => {
            setStatus('loading');
            void load();
          }}
        />
      </section>
    );
  }
  if (items.length === 0) {
    return (
      <section className={styles.root}>
        {title}
        <p className={styles.empty}>{phaseLive ? ts('live.events') : t('commentary.empty')}</p>
      </section>
    );
  }

  return <CommentaryView items={items} live={live} filter={filter} onFilter={setFilter} locale={locale} />;
}
