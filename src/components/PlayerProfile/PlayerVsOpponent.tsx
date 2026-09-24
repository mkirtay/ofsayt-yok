import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import EmptyState from '@/components/EmptyState';
import RatingBadge from '@/components/RatingBadge';
import { PanelSkeleton } from '@/components/Skeleton';
import { formatRating } from '@/config/ratingScale';
import { usePlayerVs, usePlayerVsOpponents } from '@/hooks/usePlayerVs';
import { useI18n, useTranslation } from '@/lib/i18n';
import { countsForAverage, MIN_MINUTES_FOR_AVERAGE, type PlayerLineupRow, type VsOpponent } from '@/utils/playerVs';
import { leagueNameById } from '@/utils/leagueName';
import styles from './playerVs.module.scss';

const LOCALE_TAGS: Record<string, string> = { tr: 'tr-TR', en: 'en-GB' };

function formatDate(iso: string, locale: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale] ?? LOCALE_TAGS.tr, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

/** Aramada Türkçe büyük/küçük harf ve aksan farkı gözetilmez ("fener" → "Fenerbahçe", "besiktas" → "Beşiktaş"). */
const fold = (s: string) =>
  s
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ı/g, 'i');

function Logo({ src, size = 18 }: { src?: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- CDN takım logosu; sayfanın diğer logolarıyla aynı düz <img>
    <img src={src} alt="" width={size} height={size} className={styles.logo} loading="lazy" />
  ) : (
    <span className={styles.logoPh} style={{ width: size, height: size }} aria-hidden="true" />
  );
}

/** Aranabilir rakip seçici (en çok karşılaşılan üstte). Klavye: ↑/↓ gezin, Enter seç, Esc kapat. */
function OpponentPicker({ opponents, selected, onSelect }: { opponents: VsOpponent[]; selected: VsOpponent | null; onSelect: (id: number | null) => void }) {
  const { t } = useTranslation('player');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = fold(query.trim());
    return q ? opponents.filter((o) => fold(o.name).includes(q)) : opponents;
  }, [opponents, query]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (o: VsOpponent) => {
    onSelect(o.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={styles.picker} ref={wrapRef}>
      <button
        type="button"
        className={styles.pickerBtn}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          setActive(0);
        }}
        data-testid="vs-picker"
      >
        {selected ? (
          <>
            <Logo src={selected.logo} />
            <span className={styles.pickerText}>{selected.name}</span>
            <span className={styles.count}>{t('vs.matchCount', { count: selected.matches })}</span>
          </>
        ) : (
          <span className={styles.pickerText}>{t('vs.pick')}</span>
        )}
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className={styles.popover}>
          <input
            ref={inputRef}
            type="search"
            className={styles.search}
            placeholder={t('vs.search')}
            aria-label={t('vs.search')}
            aria-controls={listId}
            aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && filtered[active]) {
                e.preventDefault();
                choose(filtered[active]);
              } else if (e.key === 'Escape') {
                setOpen(false);
              }
            }}
          />
          <ul className={styles.list} role="listbox" id={listId} aria-label={t('vs.pick')}>
            {filtered.length === 0 ? <li className={styles.noResults}>{t('vs.noResults')}</li> : null}
            {filtered.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={selected?.id === o.id}
                className={`${styles.option} ${i === active ? styles.optionActive : ''}`.trim()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
              >
                <Logo src={o.logo} />
                <span className={styles.pickerText}>{o.name}</span>
                <span className={styles.count}>{t('vs.matchCount', { count: o.matches })}</span>
              </li>
            ))}
          </ul>
          {selected ? (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              {t('vs.clear')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MatchRow({ r }: { r: PlayerLineupRow }) {
  const { t } = useTranslation('player');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const league = leagueNameById(r.leagueId, r.leagueName, tl);
  const home = r.isHome ? r.teamName : r.opponentName;
  const away = r.isHome ? r.opponentName : r.teamName;
  const known = r.goalsFor != null && r.goalsAgainst != null;
  // Erişilebilir etiket gerçek skor sırasıyla (ev-dep); görünen skor oyuncunun takımı açısından (atılan-yenilen) + sonuç rengi
  const score = known ? (r.isHome ? `${r.goalsFor}-${r.goalsAgainst}` : `${r.goalsAgainst}-${r.goalsFor}`) : '—';
  const result = !known ? '' : r.goalsFor! > r.goalsAgainst! ? styles.win : r.goalsFor! < r.goalsAgainst! ? styles.loss : styles.draw;
  const short = r.rating != null && !countsForAverage(r);
  return (
    <li>
      <Link
        href={`/matches/${r.fixtureId}`}
        className={styles.row}
        prefetch={false}
        aria-label={t('vs.rowLabel', {
          date: formatDate(r.date, locale),
          league,
          home,
          score,
          away,
          minutes: r.minutes ?? '—',
          rating: formatRating(r.rating) ?? '—',
        })}
        data-testid="vs-row"
      >
        <span className={styles.rowMeta}>
          <span>{formatDate(r.date, locale)}</span>
          <span className={styles.league}>{league}</span>
        </span>
        <span className={styles.rowTeam}>
          <Logo src={r.teamLogo} />
          <span className={styles.teamName}>{r.teamName}</span>
          <span className={styles.venue}>{r.isHome ? t('vs.home') : t('vs.away')}</span>
          <span className={`${styles.score} ${result}`.trim()}>{known ? `${r.goalsFor}-${r.goalsAgainst}` : '—'}</span>
        </span>
        <span className={styles.rowStats}>
          <span className={styles.minutes}>
            {r.minutes != null ? `${r.minutes}'` : '—'}
            {!r.started ? <span className={styles.sub} title={t('vs.sub')}> ↑</span> : null}
          </span>
          <span className={styles.ratingCell}>
            <RatingBadge rating={r.rating} showEmpty />
            {short ? (
              <span className={styles.shortMark} title={t('vs.shortMinutesMark', { min: MIN_MINUTES_FOR_AVERAGE })}>
                *
              </span>
            ) : null}
          </span>
          <span className={styles.ga}>
            {t('vs.goalsShort')} {r.goals ?? 0} · {t('vs.assistsShort')} {r.assists ?? 0}
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * "Rakibe karşı performans" — seçili rakip URL'de (`?vs=34`): paylaşılabilir, geri tuşu önceki seçime döner
 * (`router.push`, shallow). Veri `/api/players/{id}/vs` (oyuncu başına 12 saat cache'li tek Sportmonks isteği).
 */
export default function PlayerVsOpponent({ playerId }: { playerId: number }) {
  const { t } = useTranslation('player');
  const router = useRouter();
  const vsParam = Array.isArray(router.query.vs) ? router.query.vs[0] : router.query.vs;
  const opponentId = vsParam && /^\d+$/.test(vsParam) ? Number(vsParam) : null;

  const list = usePlayerVsOpponents(playerId);
  const vs = usePlayerVs(playerId, opponentId);
  const opponents = list.data?.opponents ?? [];
  const selected =
    opponentId == null
      ? null
      : (opponents.find((o) => o.id === opponentId) ??
        (vs.data?.opponent ? { ...vs.data.opponent, matches: vs.data.matches.length } : null));

  const onSelect = (id: number | null) => {
    const { vs: _drop, ...rest } = router.query;
    void router.push({ pathname: router.pathname, query: id == null ? rest : { ...rest, vs: String(id) } }, undefined, {
      shallow: true,
      scroll: false,
    });
  };

  const data = vs.data;
  const s = data?.summary;
  const shortRated = data?.matches.some((r) => r.rating != null && !countsForAverage(r)) ?? false;

  return (
    <section className={styles.card} aria-labelledby="pp-vs" data-testid="player-vs">
      <div className={styles.head}>
        <h2 id="pp-vs" className={styles.title}>{t('vs.title')}</h2>
        {opponents.length > 0 ? <OpponentPicker opponents={opponents} selected={selected} onSelect={onSelect} /> : null}
      </div>

      {list.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : list.isError ? (
        <EmptyState>{t('vs.error')}</EmptyState>
      ) : opponents.length === 0 ? (
        <EmptyState>{t('vs.noOpponents')}</EmptyState>
      ) : opponentId == null ? (
        <p className={styles.hint}>{t('vs.pickHint')}</p>
      ) : vs.isLoading ? (
        <PanelSkeleton rows={4} />
      ) : vs.isError || !data || !s ? (
        <EmptyState>{t('vs.error')}</EmptyState>
      ) : (
        <>
          {data.matches.length === 0 ? (
            <EmptyState>{t('vs.empty')}</EmptyState>
          ) : (
            <>
              <h3 className={styles.subTitle}>
                <Logo src={selected?.logo} size={16} />
                {t('vs.summaryTitle', { opponent: data.opponent?.name ?? '' })}
              </h3>
              <dl className={styles.summary} data-testid="vs-summary">
                <div className={styles.tile}>
                  <dt>{t('vs.played')}</dt>
                  <dd>{s.played}</dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('vs.record')}</dt>
                  <dd className={styles.record}>
                    <span className={styles.win}>{s.won}</span> / <span className={styles.draw}>{s.drawn}</span> /{' '}
                    <span className={styles.loss}>{s.lost}</span>
                  </dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('vs.avgRating')}</dt>
                  <dd>
                    <RatingBadge rating={s.averageRating} showEmpty size="md" />
                  </dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('vs.goals')}</dt>
                  <dd>{s.goals}</dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('vs.assists')}</dt>
                  <dd>{s.assists}</dd>
                </div>
                <div className={styles.tile}>
                  <dt>{t('vs.minutes')}</dt>
                  <dd>{s.minutes}</dd>
                </div>
              </dl>
              <ul className={styles.rows}>
                {data.matches.map((r) => (
                  <MatchRow key={r.fixtureId} r={r} />
                ))}
              </ul>
            </>
          )}
          {data.notPlayed > 0 ? (
            <p className={styles.note} data-testid="vs-not-played">{t('vs.notPlayed', { count: data.notPlayed })}</p>
          ) : null}
          {shortRated ? <p className={styles.note}>{t('vs.shortMinutesNote', { min: MIN_MINUTES_FOR_AVERAGE })}</p> : null}
        </>
      )}

      <p className={styles.coverage}>{t('vs.coverageNote')}</p>
    </section>
  );
}
