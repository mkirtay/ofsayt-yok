import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/matchState';
import { PanelSkeleton } from '@/components/Skeleton';
import LoadError from '@/components/LoadError';
import MatchStateNote from '@/components/MatchStateNote';
import type { Match } from '@/models/liveScore';
import type { CommentaryItem, CommentaryKind } from '@/services/sportmonks/matchCommentary';
import type { SceneSquads } from '@/services/sportmonks/commentaryScene';
import { matchDisplayState, specialKeepsData } from '@/utils/matchDisplayState';
import { useNow } from '@/hooks/useNow';
import { countdown, kickoffInfo } from '@/utils/kickoff';
import { countdownText } from '@/utils/kickoffText';
import { formatFixtureDate } from '@/utils/fixtureDateLabel';
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
    case 'foul':
      return svg(
        <>
          <circle cx="6" cy="10" r="3.6" />
          <path d="M8.6 7.6L14 3.5M11 3.5h3v3" />
        </>,
      );
    case 'free_kick':
      return svg(
        <>
          <circle cx="4.5" cy="11.5" r="2.3" />
          <path d="M9 5v9M12 5v9M9 5h3" />
        </>,
      );
    case 'penalty':
      return svg(
        <>
          <path d="M2 4h12v8M2 4v8" />
          <circle cx="8" cy="12.5" r="1.4" fill="currentColor" />
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
  /** Sahnesi olan satır seçiliyse üstte gösterilen temsili canlandırma (tembel yüklenir; yokken yer tutucu). */
  scene?: ReactNode;
  selectedId?: number | null;
  onSelect?: (item: CommentaryItem) => void;
};

/** Dolu anlatım: filtre çipleri (sayılarıyla) + satırlar. Saf — durum/veri `MatchCommentary`'de. */
export function CommentaryView({ items, live, filter, onFilter, locale, scene, selectedId, onSelect }: ViewProps) {
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
      {scene}
      {visible.length === 0 ? (
        <p className={styles.empty}>{t('commentary.emptyFilter')}</p>
      ) : (
        <ol className={styles.list}>
          {visible.map((item) => {
            const minute = minuteLabel(item);
            const tr = locale === 'tr' ? item.tr : null;
            const kindLabel = item.kind === 'card' && isRed(item) ? t('commentary.kinds.redCard') : t(`commentary.kinds.${item.kind}`);
            const playable = !!item.scene && !!onSelect;
            const Row = playable ? 'button' : 'div';
            return (
              <li key={item.id} className={styles.rowItem}>
                <Row
                  {...(playable ? { type: 'button' as const, onClick: () => onSelect!(item), 'aria-pressed': selectedId === item.id } : {})}
                  className={[
                    styles.row,
                    item.important ? styles.important : '',
                    item.kind === 'goal' ? styles.goal : '',
                    playable ? styles.playable : '',
                    playable && selectedId === item.id ? styles.playing : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
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
                {playable ? <span className={styles.playHint}>{t('commentary.scene.play')}</span> : null}
                </Row>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** 404 (maç yok) = boş anlatım; diğer başarısız yanıtlar fırlatır (hata ≠ veri yok). */
async function fetchCommentary(matchId: string, signal?: AbortSignal): Promise<{ items: CommentaryItem[]; live: boolean; squads: SceneSquads | null }> {
  const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/commentary`, { signal });
  if (res.status === 404) return { items: [], live: false, squads: null };
  if (!res.ok) throw new Error(`commentary ${res.status}`);
  const body = (await res.json()) as { items?: CommentaryItem[]; live?: boolean; squads?: SceneSquads | null };
  return { items: Array.isArray(body.items) ? body.items : [], live: !!body.live, squads: body.squads ?? null };
}

type SceneProps = { item: CommentaryItem | null; squads: SceneSquads | null; kickoff?: boolean };

let sceneLoad: Promise<ComponentType<SceneProps>> | null = null;
/** Sahne (saha çizimi + animasyonlar) ayrı chunk: yalnız Anlatım sekmesinde, sahnesi olan satır varsa indirilir. */
function loadScene(): Promise<ComponentType<SceneProps>> {
  sceneLoad ??= import('./CommentaryScene').then(
    (mod) => mod.default,
    (error) => {
      sceneLoad = null;
      throw error;
    },
  );
  return sceneLoad;
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
  const [squads, setSquads] = useState<SceneSquads | null>(null);
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
          setSquads(data.squads);
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

  // Sahne: seçili satır yoksa en yeni sahneli satır (canlı maçta kendiliğinden son olayı gösterir).
  const sceneItems = useMemo(() => items.filter((i) => i.scene), [items]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replay, setReplay] = useState(0);
  const current = useMemo(() => sceneItems.find((i) => i.id === selectedId) ?? sceneItems[0] ?? null, [sceneItems, selectedId]);

  // Maç öncesi de sahne gösterilir (bekleme dizilişi) → chunk sekme açılınca istenir.
  const preMatch = state?.phase === 'PRE' && !blockingSpecial;
  const [Scene, setScene] = useState<ComponentType<SceneProps> | null>(null);
  useEffect(() => {
    if ((!current && !preMatch) || Scene) return;
    let alive = true;
    // Sahne yüklenemezse (ağ hatası) anlatım listesi olduğu gibi kalır — sahne süs, veri değil.
    void loadScene().then(
      (mod) => {
        if (alive) setScene(() => mod);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [current, preMatch, Scene]);

  const onSelect = useCallback((item: CommentaryItem) => {
    setSelectedId(item.id);
    setReplay((n) => n + 1);
  }, []);

  // İlk düdük bilgisi + geri sayım (maç öncesi): tarih SSR'da sabit, geri sayım yalnız mount sonrası.
  const kickoff = kickoffInfo(match);
  const now = useNow(30_000, preMatch && kickoff != null);
  const kickoffWhen = kickoff ? `${formatFixtureDate(kickoff.dayIso, locale)}, ${kickoff.time}` : null;

  const title = <h3 className={styles.title}>{t('commentary.title')}</h3>;

  if (blockingSpecial) {
    return (
      <section className={styles.root}>
        {title}
        <MatchStateNote special={blockingSpecial} variant="message" />
      </section>
    );
  }
  if (preMatch) {
    return (
      <section className={styles.root}>
        {title}
        {Scene ? <Scene item={null} squads={null} kickoff /> : <div className={styles.scenePlaceholder} aria-hidden="true" />}
        <div className={styles.preMatch} role="status">
          <strong>{ts('pre.statsTitle')}</strong>
          <span className={styles.preSub}>{t('commentary.pre')}</span>
          {kickoffWhen ? (
            <>
              <span className={styles.preKick}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 7 12 12 15 14" />
                </svg>
                {ts('pre.kickoff', { when: kickoffWhen })}
              </span>
              <span className={styles.preCountdown} aria-live="off">
                {now != null && kickoff ? countdownText(countdown(kickoff.ms, now), ts) : ' '}
              </span>
            </>
          ) : null}
        </div>
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

  // Yer tutucu: sahne chunk'ı gelene kadar aynı en-boy oranında kutu durur (kayma yok).
  const scene = current ? (
    Scene ? (
      <Scene key={`${current.id}-${replay}`} item={current} squads={squads} />
    ) : (
      <div className={styles.scenePlaceholder} aria-hidden="true" />
    )
  ) : null;

  return (
    <CommentaryView
      items={items}
      live={live}
      filter={filter}
      onFilter={setFilter}
      locale={locale}
      scene={scene}
      selectedId={current?.id ?? null}
      onSelect={onSelect}
    />
  );
}
