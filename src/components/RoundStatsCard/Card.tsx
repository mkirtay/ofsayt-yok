import '@/lib/i18nNamespaces/roundStats';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import RatingBadge from '@/components/RatingBadge';
import { statUnitKey, type RoundStatsSummary, type StatEntity, type StatUnit, type StatUnitMode } from '@/services/sportmonks/roundStats';
import { unitDateRange, unitLabel } from './labels';
import styles from './roundStatsCard.module.scss';

export type RoundStatsCardProps = { leagueId: number; seasonId: number | null };

type Payload = { mode: StatUnitMode; units: StatUnit[]; selected: string | null; summary: RoundStatsSummary | null };

class HiddenError extends Error {}

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
 */
export default function RoundStatsCard({ leagueId, seasonId }: RoundStatsCardProps) {
  const { t } = useTranslation('roundStats');
  const { locale } = useI18n();
  // Seçim lig+sezona bağlı: lig/sezon değişince kendiliğinden varsayılana döner (effect'te sıfırlamaya gerek yok).
  const scope = `${leagueId}:${seasonId ?? ''}`;
  const [picked, setPicked] = useState<{ scope: string; unit: string } | null>(null);
  const unit = picked?.scope === scope ? picked.unit : null;

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
  const view = unit == null || unit === base.data.selected ? base : chosen;
  const loadingOther = view === chosen && (chosen.isPending || chosen.isPlaceholderData);
  const summary = view === base ? base.data.summary : (chosen.data?.selected === unit ? chosen.data.summary : null);
  const isStage = mode === 'stages';
  const go = (i: number) => {
    const u = units[i];
    if (u) setPicked({ scope, unit: statUnitKey(u) });
  };
  const title = isStage ? t('titleStage') : t('titleRound');
  const dates = current ? unitDateRange(current.start, current.end, locale) : null;

  return (
    <section className={styles.card} aria-labelledby="round-stats-title" aria-busy={loadingOther || undefined}>
      <header className={styles.header}>
        <h2 id="round-stats-title" className={styles.title}>
          {title}
        </h2>
        <div className={styles.picker}>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => go(index - 1)}
            disabled={index <= 0}
            aria-label={isStage ? t('prevStage') : t('prevRound')}
          >
            ‹
          </button>
          <div className={styles.unit} aria-live="polite">
            <span className={styles.unitName}>{current ? unitLabel(current, t) : ''}</span>
            <span className={styles.unitMeta}>
              {[dates, current && !current.complete ? t('inProgress') : null].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => go(index + 1)}
            disabled={index < 0 || index >= units.length - 1}
            aria-label={isStage ? t('nextStage') : t('nextRound')}
          >
            ›
          </button>
        </div>
      </header>

      {view.isError ? (
        <p className={styles.message}>
          {t('loadError')}{' '}
          <button type="button" className={styles.retry} onClick={() => void view.refetch()}>
            {t('retry')}
          </button>
        </p>
      ) : loadingOther ? (
        <div className={styles.body} aria-hidden="true" />
      ) : !summary ? (
        <p className={styles.message}>{t('noData')}</p>
      ) : (
        <SummaryBody summary={summary} isStage={isStage} nf={nf} pf={pf} t={t} />
      )}
    </section>
  );
}

type BodyProps = {
  summary: RoundStatsSummary;
  isStage: boolean;
  nf: Intl.NumberFormat;
  pf: Intl.NumberFormat;
  t: (key: string, opts?: Record<string, unknown>) => string;
};

function SummaryBody({ summary: s, isStage, nf, pf, t }: BodyProps) {
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
        {s.topPlayer ? (
          <Highlight kind="player" label={isStage ? t('topPlayerStage') : t('topPlayerRound')} entity={s.topPlayer}>
            <RatingBadge rating={s.topPlayer.rating} size="sm" ariaLabel={`${t('rating')} ${nf.format(s.topPlayer.rating)}`} />
          </Highlight>
        ) : null}
        {s.topTeam ? (
          <Highlight kind="team" label={isStage ? t('topTeamStage') : t('topTeamRound')} entity={s.topTeam}>
            <RatingBadge rating={s.topTeam.rating} size="sm" ariaLabel={`${t('rating')} ${nf.format(s.topTeam.rating)}`} />
          </Highlight>
        ) : null}
        {s.topScorer ? (
          <Highlight kind="player" label={t('topScorer')} entity={s.topScorer}>
            <span className={styles.count}>{t('goalsCount', { n: s.topScorer.goals })}</span>
          </Highlight>
        ) : null}
        {s.mostGoalsTeam ? (
          <Highlight kind="team" label={t('mostGoalsTeam')} entity={s.mostGoalsTeam}>
            <span className={styles.count}>{t('goalsCount', { n: s.mostGoalsTeam.goals })}</span>
          </Highlight>
        ) : null}
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
