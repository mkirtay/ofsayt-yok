import '@/lib/i18nNamespaces/roundStats';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import RatingBadge from '@/components/RatingBadge';
import { statUnitKey, type RoundStatsSummary, type StatEntity, type StatUnit, type StatUnitMode } from '@/services/sportmonks/roundStats';
import type { SeasonStatsSummary } from '@/services/sportmonks/seasonStats';
import { unitDateRange, unitLabel } from './labels';
import styles from './roundStatsCard.module.scss';

export type SummaryView = 'unit' | 'season';

export type RoundStatsCardProps = {
  leagueId: number;
  seasonId: number | null;
  /** Başlangıç görünümü (varsayılan hafta / aşama; test ve ileride ?görünüm için). */
  initialView?: SummaryView;
};

type Payload = { mode: StatUnitMode; units: StatUnit[]; selected: string | null; summary: RoundStatsSummary | null };
type SeasonPayload = { season: { id: number; name: string | null; finished: boolean }; summary: SeasonStatsSummary | null };

class HiddenError extends Error {}

async function fetchSeasonStats(leagueId: number, seasonId: number): Promise<SeasonPayload> {
  const q = new URLSearchParams({ league: String(leagueId), season: String(seasonId) });
  const res = await fetch(`/api/leagues/season-stats?${q.toString()}`);
  if (res.status === 400) throw new HiddenError('season-stats 400');
  if (!res.ok) throw new Error(`season-stats ${res.status}`);
  return (await res.json()) as SeasonPayload;
}

async function fetchRoundStats(leagueId: number, seasonId: number, unit: string | null): Promise<Payload> {
  const q = new URLSearchParams({ league: String(leagueId), season: String(seasonId) });
  if (unit) q.set('unit', unit);
  const res = await fetch(`/api/leagues/round-stats?${q.toString()}`);
  // 400: lig/sezon eşleşmiyor (ör. sezon listesi henüz yeni ligin değil) → kart gizlenir; 5xx/429 → hata + tekrar dene.
  if (res.status === 400) throw new HiddenError('round-stats 400');
  if (!res.ok) throw new Error(`round-stats ${res.status}`);
  return (await res.json()) as Payload;
}

/**
 * Lig sayfası "Haftanın Özeti" / kupalarda "Aşama Özeti" kartı. Veri `/api/leagues/round-stats` (CDN'li, kullanıcıdan
 * bağımsız). Varsayılan: son tamamlanan hafta (kupada son başlamış aşama); ‹ › ile önceki / sonraki.
 * Veri yoksa (hiç birim yok ya da varsayılan birim boş) kart hiç çizilmez; hata ≠ veri yok (hata mesajı + tekrar dene).
 * "Hafta | Sezon" (kupada "Aşama | Sezon") seçici: Sezon görünümü `/api/leagues/season-stats`'tan, yalnız seçilince istenir;
 * başlık yüksekliği iki görünümde aynı (‹ › gizlenir ama yer tutar).
 */
export default function RoundStatsCard({ leagueId, seasonId, initialView = 'unit' }: RoundStatsCardProps) {
  const { t } = useTranslation('roundStats');
  const { locale } = useI18n();
  // Seçim lig+sezona bağlı: lig/sezon değişince kendiliğinden varsayılana döner (effect'te sıfırlamaya gerek yok).
  const scope = `${leagueId}:${seasonId ?? ''}`;
  const [picked, setPicked] = useState<{ scope: string; unit: string } | null>(null);
  const unit = picked?.scope === scope ? picked.unit : null;
  // Hafta | Sezon seçimi lig değişince korunur (kullanıcı sezonu izliyorsa diğer ligde de sezonu görür).
  const [view, setView] = useState<SummaryView>(initialView);

  // Sezon özeti yalnız "Sezon" seçilince istenir (varsayılan görünümün isteği / paketi değişmez).
  const seasonQ = useQuery({
    queryKey: ['season-stats', leagueId, seasonId] as const,
    queryFn: () => fetchSeasonStats(leagueId, seasonId!),
    enabled: seasonId != null && view === 'season',
    staleTime: 30 * 60_000,
    retry: (n, e) => !(e instanceof HiddenError) && n < 1,
  });

  const base = useQuery({
    queryKey: ['round-stats', leagueId, seasonId, 'default'] as const,
    queryFn: () => fetchRoundStats(leagueId, seasonId!, null),
    enabled: seasonId != null,
    staleTime: 10 * 60_000,
    retry: (n, e) => !(e instanceof HiddenError) && n < 1,
  });
  const chosen = useQuery({
    queryKey: ['round-stats', leagueId, seasonId, unit] as const,
    queryFn: () => fetchRoundStats(leagueId, seasonId!, unit),
    enabled: seasonId != null && unit != null && unit !== base.data?.selected,
    staleTime: 10 * 60_000,
    retry: (n, e) => !(e instanceof HiddenError) && n < 1,
    placeholderData: (prev) => prev,
  });

  const nf = useMemo(() => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 }), [locale]);
  const pf = useMemo(() => new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { style: 'percent', maximumFractionDigits: 0 }), [locale]);

  // Henüz sezon yok / ilk yükleme: yer tutucu (yükseklik dış kutuda ayrılmış).
  if (seasonId == null || base.isPending) return <div className={styles.card} aria-busy="true" />;
  if (base.isError) {
    if (base.error instanceof HiddenError) return null;
    return (
      <section className={styles.card}>
        <p className={styles.message}>
          {t('loadError')}{' '}
          <button type="button" className={styles.retry} onClick={() => void base.refetch()}>
            {t('retry')}
          </button>
        </p>
      </section>
    );
  }
  const units = base.data.units;
  // Veri yok → kart gizli (varsayılan birim boşsa da: oynanmış hafta yok).
  if (units.length === 0 || !base.data.summary) return null;

  const mode = base.data.mode;
  const selectedKey = unit ?? base.data.selected;
  const index = units.findIndex((u) => statUnitKey(u) === selectedKey);
  const current = units[index];
  const unitQ = unit == null || unit === base.data.selected ? base : chosen;
  const loadingOther = unitQ === chosen && (chosen.isPending || chosen.isPlaceholderData);
  const summary = unitQ === base ? base.data.summary : (chosen.data?.selected === unit ? chosen.data.summary : null);
  const isStage = mode === 'stages';
  const isSeason = view === 'season';
  const go = (i: number) => {
    const u = units[i];
    if (u) setPicked({ scope, unit: statUnitKey(u) });
  };
  const title = isSeason ? t('titleSeason') : isStage ? t('titleStage') : t('titleRound');
  const dates = current ? unitDateRange(current.start, current.end, locale) : null;

  const seasonInfo = seasonQ.data?.season;
  // Sezon görünümünde ‹ › yerinde kalır ama gizlenir (başlık yüksekliği / genişliği aynı → görünüm değişiminde kayma yok).
  const unitName = isSeason ? (seasonInfo?.name ?? '') : current ? unitLabel(current, t) : '';
  const unitMeta = isSeason
    ? seasonInfo
      ? [seasonInfo.finished ? t('seasonFinished') : t('inProgress'), isStage ? t('allStages') : null].filter(Boolean).join(' · ')
      : ''
    : [dates, current && !current.complete ? t('inProgress') : null].filter(Boolean).join(' · ');
  const seasonLoading = isSeason && seasonQ.isPending;
  // Sezon ucu 400 (lig/sezon uyuşmuyor) → yalnız sezon görünümü "veri yok" der; kart hafta görünümüyle kalır.
  const seasonHidden = isSeason && seasonQ.error instanceof HiddenError;

  let body: React.ReactNode;
  if (isSeason) {
    if (seasonLoading) body = <div className={styles.body} aria-hidden="true" />;
    else if (seasonQ.isError && !seasonHidden) body = <ErrorMessage t={t} onRetry={() => void seasonQ.refetch()} />;
    else if (!seasonQ.data?.summary) body = <p className={styles.message}>{t('noData')}</p>;
    else body = <SummaryBody summary={seasonQ.data.summary} highlights={seasonHighlights(seasonQ.data.summary, nf, t)} nf={nf} pf={pf} t={t} />;
  } else if (unitQ.isError) {
    body = <ErrorMessage t={t} onRetry={() => void unitQ.refetch()} />;
  } else if (loadingOther) {
    body = <div className={styles.body} aria-hidden="true" />;
  } else if (!summary) {
    body = <p className={styles.message}>{t('noData')}</p>;
  } else {
    body = <SummaryBody summary={summary} highlights={unitHighlights(summary, isStage, nf, t)} nf={nf} pf={pf} t={t} />;
  }

  return (
    <section className={styles.card} aria-labelledby="round-stats-title" aria-busy={loadingOther || seasonLoading || undefined}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 id="round-stats-title" className={styles.title}>
            {title}
          </h2>
          <div className={styles.views} role="group" aria-label={t('viewLabel')}>
            <button
              type="button"
              className={`${styles.viewBtn} ${!isSeason ? styles.viewBtnActive : ''}`.trim()}
              aria-pressed={!isSeason}
              onClick={() => setView('unit')}
            >
              {isStage ? t('viewStage') : t('viewRound')}
            </button>
            <button
              type="button"
              className={`${styles.viewBtn} ${isSeason ? styles.viewBtnActive : ''}`.trim()}
              aria-pressed={isSeason}
              onClick={() => setView('season')}
            >
              {t('viewSeason')}
            </button>
          </div>
        </div>
        <div className={styles.picker}>
          <button
            type="button"
            className={`${styles.navBtn} ${isSeason ? styles.navHidden : ''}`.trim()}
            onClick={() => go(index - 1)}
            disabled={isSeason || index <= 0}
            aria-hidden={isSeason || undefined}
            tabIndex={isSeason ? -1 : undefined}
            aria-label={isStage ? t('prevStage') : t('prevRound')}
          >
            ‹
          </button>
          <div className={styles.unit} aria-live="polite">
            <span className={styles.unitName}>{unitName}</span>
            <span className={styles.unitMeta}>{unitMeta}</span>
          </div>
          <button
            type="button"
            className={`${styles.navBtn} ${isSeason ? styles.navHidden : ''}`.trim()}
            onClick={() => go(index + 1)}
            disabled={isSeason || index < 0 || index >= units.length - 1}
            aria-hidden={isSeason || undefined}
            tabIndex={isSeason ? -1 : undefined}
            aria-label={isStage ? t('nextStage') : t('nextRound')}
          >
            ›
          </button>
        </div>
      </header>

      {body}
    </section>
  );
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function ErrorMessage({ t, onRetry }: { t: Translate; onRetry: () => void }) {
  return (
    <p className={styles.message}>
      {t('loadError')}{' '}
      <button type="button" className={styles.retry} onClick={onRetry}>
        {t('retry')}
      </button>
    </p>
  );
}

type HighlightItem = { key: string; kind: 'player' | 'team'; label: string; entity: StatEntity; value: React.ReactNode };

function ratingBadge(rating: number, nf: Intl.NumberFormat, t: Translate) {
  return <RatingBadge rating={rating} size="sm" ariaLabel={`${t('rating')} ${nf.format(rating)}`} />;
}

const countValue = (text: string, title?: string) => (
  <span className={styles.count} title={title}>
    {text}
  </span>
);

/** Hafta / aşama: en iyi oyuncu + takım, gol kralı, en golcü takım (en çok 4 satır). */
function unitHighlights(s: RoundStatsSummary, isStage: boolean, nf: Intl.NumberFormat, t: Translate): HighlightItem[] {
  const out: HighlightItem[] = [];
  if (s.topPlayer) out.push({ key: 'player', kind: 'player', label: isStage ? t('topPlayerStage') : t('topPlayerRound'), entity: s.topPlayer, value: ratingBadge(s.topPlayer.rating, nf, t) });
  if (s.topTeam) out.push({ key: 'team', kind: 'team', label: isStage ? t('topTeamStage') : t('topTeamRound'), entity: s.topTeam, value: ratingBadge(s.topTeam.rating, nf, t) });
  if (s.topScorer) out.push({ key: 'scorer', kind: 'player', label: t('topScorer'), entity: s.topScorer, value: countValue(t('goalsCount', { n: s.topScorer.goals })) });
  if (s.mostGoalsTeam) out.push({ key: 'scored', kind: 'team', label: t('mostGoalsTeam'), entity: s.mostGoalsTeam, value: countValue(t('goalsCount', { n: s.mostGoalsTeam.goals })) });
  return out;
}

/** Sezon: krallar önce (gol, asist), sonra puanlar, takımlar, kart ve kaleci (en çok 8 satır). */
function seasonHighlights(s: SeasonStatsSummary, nf: Intl.NumberFormat, t: Translate): HighlightItem[] {
  const out: HighlightItem[] = [];
  if (s.topScorer) out.push({ key: 'scorer', kind: 'player', label: t('topScorerSeason'), entity: s.topScorer, value: countValue(t('goalsCount', { n: s.topScorer.goals })) });
  if (s.topAssist) out.push({ key: 'assist', kind: 'player', label: t('topAssistSeason'), entity: s.topAssist, value: countValue(t('assistsCount', { n: s.topAssist.assists })) });
  if (s.topPlayer) out.push({ key: 'player', kind: 'player', label: t('topPlayerSeason'), entity: s.topPlayer, value: ratingBadge(s.topPlayer.rating, nf, t) });
  if (s.topTeam) out.push({ key: 'team', kind: 'team', label: t('topTeamSeason'), entity: s.topTeam, value: ratingBadge(s.topTeam.rating, nf, t) });
  if (s.mostGoalsTeam) out.push({ key: 'scored', kind: 'team', label: t('mostGoalsTeam'), entity: s.mostGoalsTeam, value: countValue(t('goalsCount', { n: s.mostGoalsTeam.goals })) });
  if (s.mostConcededTeam) out.push({ key: 'conceded', kind: 'team', label: t('mostConcededTeam'), entity: s.mostConcededTeam, value: countValue(t('goalsCount', { n: s.mostConcededTeam.goals })) });
  if (s.topCards) out.push({ key: 'cards', kind: 'player', label: t('topCards'), entity: s.topCards, value: countValue(t('cardsCount', { n: s.topCards.cards })) });
  if (s.cleanSheetKeeper) {
    const k = s.cleanSheetKeeper;
    const title = k.games != null ? t('cleanSheetsOf', { n: k.cleanSheets, total: k.games }) : undefined;
    out.push({ key: 'keeper', kind: 'player', label: t('cleanSheetKeeper'), entity: k, value: countValue(t('cleanSheetsCount', { n: k.cleanSheets }), title) });
  }
  return out;
}

type BodyProps = {
  summary: RoundStatsSummary;
  highlights: HighlightItem[];
  nf: Intl.NumberFormat;
  pf: Intl.NumberFormat;
  t: Translate;
};

function SummaryBody({ summary: s, highlights, nf, pf, t }: BodyProps) {
  const played = s.scheduled != null && s.scheduled > s.played ? t('playedOf', { played: s.played, total: s.scheduled }) : t('played', { played: s.played });
  const maxBin = Math.max(1, ...(s.scoringMinutes ?? []).map((b) => b.count));
  return (
    <div className={styles.body}>
      <p className={styles.played}>{played}</p>
      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>{t('goals')}</dt>
          <dd className={styles.value}>{nf.format(s.goals.total)}</dd>
          <dd className={styles.sub}>{t('goalsPerMatch', { v: nf.format(s.goals.perMatch) })}</dd>
        </div>
        {s.bothScored ? (
          <div className={styles.tile}>
            <dt>{t('bothScored')}</dt>
            <dd className={styles.value}>{pf.format(s.bothScored.pct / 100)}</dd>
            <dd className={styles.sub}>{t('ofMatches', { n: s.bothScored.count, total: s.played })}</dd>
          </div>
        ) : null}
        {s.threePlusGoals ? (
          <div className={styles.tile}>
            <dt>{t('threePlus')}</dt>
            <dd className={styles.value}>{pf.format(s.threePlusGoals.pct / 100)}</dd>
            <dd className={styles.sub}>{t('ofMatches', { n: s.threePlusGoals.count, total: s.played })}</dd>
          </div>
        ) : null}
        {s.cards ? (
          <div className={styles.tile}>
            <dt>{t('cards')}</dt>
            <dd className={styles.value}>{nf.format(s.cards.yellow + s.cards.red)}</dd>
            <dd className={styles.sub}>{t('cardsDetail', { yellow: s.cards.yellow, red: s.cards.red })}</dd>
          </div>
        ) : null}
      </dl>

      <ul className={styles.highlights}>
        {highlights.map((h) => (
          <Highlight key={h.key} kind={h.kind} label={h.label} entity={h.entity}>
            {h.value}
          </Highlight>
        ))}
      </ul>

      {s.scoringMinutes && s.goals.total > 0 ? (
        <figure className={styles.minutes}>
          <figcaption className={styles.minutesTitle}>{t('minutes')}</figcaption>
          <ol className={styles.bars}>
            {s.scoringMinutes.map((b) => {
              const label = t('minuteBin', { bin: b.bin, count: b.count });
              return (
                <li key={b.bin} className={styles.barCol} title={label} aria-label={label}>
                  <span className={styles.barCount} aria-hidden="true">
                    {b.count}
                  </span>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={styles.bar} style={{ height: `${Math.round((b.count / maxBin) * 100)}%` }} />
                  </span>
                  <span className={styles.barLabel} aria-hidden="true">
                    {b.bin}
                  </span>
                </li>
              );
            })}
          </ol>
        </figure>
      ) : null}
    </div>
  );
}

function Highlight({ kind, label, entity, children }: { kind: 'player' | 'team'; label: string; entity: StatEntity; children: React.ReactNode }) {
  const initials = entity.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <li className={styles.highlight}>
      <TeamLogo
        src={entity.image}
        width={32}
        className={kind === 'player' ? styles.avatarPlayer : styles.avatarTeam}
        fallback={<span className={styles.avatarFallback} aria-hidden="true">{initials}</span>}
      />
      <span className={styles.hlText}>
        <span className={styles.hlLabel}>{label}</span>
        <Link href={kind === 'player' ? `/players/${entity.id}` : `/teams/${entity.id}`} prefetch={false} className={styles.hlName}>
          {entity.name}
        </Link>
      </span>
      <span className={styles.hlValue}>{children}</span>
    </li>
  );
}
