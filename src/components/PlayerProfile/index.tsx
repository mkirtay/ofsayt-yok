import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import { PanelSkeleton } from '@/components/Skeleton';
import { useI18n, useTranslation } from '@/lib/i18n';
import { usePlayerMatchHistory, usePlayerProfile, usePlayerRatingTrend } from '@/hooks/usePlayerProfile';
import { pickDefaultSeason, type PlayerMatchRow, type PlayerProfile as Profile, type PlayerSeasonStats, type PlayerTransfer } from '@/services/playerProfile';
import { PLAYER_STAT_GROUPS, STAT, formatStat, statMain } from '@/services/sportmonks/playerStatTypes';
import RatingBadge from '@/components/RatingBadge';
import { formatRating } from '@/config/ratingScale';
import RatingTrendChart from './RatingTrendChart';
import styles from './playerProfile.module.scss';

/* ─── Saf yardımcılar (test edilir) ─── */

export function ageFromBirth(dateOfBirth: string | undefined, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const d = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  return age >= 0 ? age : null;
}

const TRANSFER_TYPE_TR: Record<string, string> = {
  Transfer: 'Transfer',
  Loan: 'Kiralık',
  'End of loan': 'Kiralık dönüşü',
  Free: 'Serbest',
  'Free Transfer': 'Serbest',
};

/** Sözlük anahtarı da API'nin kendi tipi (`Loan`, `End of loan`…) — bilinmeyen tip olduğu gibi gösterilir. */
export const transferTypeLabel = (type: string, t?: Translate) => {
  if (!TRANSFER_TYPE_TR[type]) return type; // API'de bilinmeyen tip → çeviri aranmaz
  return t ? t(`transfers.type.${type}`) : TRANSFER_TYPE_TR[type];
};

export type Translate = (key: string, opts?: Record<string, unknown>) => string;

const LOCALE_TAGS: Record<string, string> = { tr: 'tr-TR', en: 'en-GB' };
const tag = (locale?: string) => LOCALE_TAGS[locale ?? 'tr'] ?? LOCALE_TAGS.tr;

/**
 * Bedel para birimi yanıtta verilmiyor → sembolsüz "75 Mn" / "75 M"; yoksa (kiralık vb.) `null` (UI "—").
 * `t`/`locale` verilmezse Türkçe davranış — saf fonksiyon olarak doğrudan da çağrılabilsin diye.
 */
export function formatTransferAmount(
  amount: number | null | undefined,
  t?: Translate,
  locale?: string,
): string | null {
  if (typeof amount !== 'number' || !(amount > 0)) return null;
  const million = t ? t('transfers.million') : 'Mn';
  const thousand = t ? t('transfers.thousand') : 'Bin';
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString(tag(locale), { maximumFractionDigits: 1 })} ${million}`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000).toLocaleString(tag(locale))} ${thousand}`;
  return String(amount);
}

/** Aktif dile göre kısa tarih ("31 Tem 2025" / "31 Jul 2025"); dil verilmezse Türkçe. */
export function formatPlayerDate(iso: string | undefined, locale?: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(tag(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d);
}

const seasonLabel = (s: PlayerSeasonStats) =>
  [s.seasonName, s.leagueName, s.teamName].filter(Boolean).join(' · ');

/* ─── Bölümler ─── */

function Header({ p }: { p: Profile }) {
  const { t } = useTranslation('player');
  const age = ageFromBirth(p.dateOfBirth);
  return (
    <section className={styles.header}>
      {p.photo ? <img src={p.photo} alt={p.name} className={styles.photo} width={96} height={96} /> : <div className={`${styles.photo} ${styles.photoEmpty}`} aria-hidden="true" />}
      <div className={styles.headerInfo}>
        <h1 className={styles.name}>{p.name}</h1>
        {p.currentTeam ? (
          <div className={styles.teamLine}>
            {p.currentTeam.logo ? <img src={p.currentTeam.logo} alt="" width={18} height={18} className={styles.teamLogo} /> : null}
            {p.currentTeam.id != null ? (
              <Link href={`/teams/${p.currentTeam.id}`} className={styles.teamLink}>
                {p.currentTeam.name}
              </Link>
            ) : (
              <span>{p.currentTeam.name}</span>
            )}
          </div>
        ) : null}
        <div className={styles.chips}>
          {p.position ? <span className={styles.chip}>{p.detailedPosition ?? p.position}</span> : null}
          {p.nationality ? (
            <span className={styles.chip}>
              {p.nationality.flag ? <img src={p.nationality.flag} alt="" width={16} height={12} className={styles.flag} /> : null}
              {p.nationality.name}
            </span>
          ) : null}
          {age != null ? <span className={styles.chip}>{t('ageChip', { age })}</span> : null}
        </div>
      </div>
    </section>
  );
}

/** `preferredFoot` API'de `right|left|both`; başka bir değer gelirse olduğu gibi gösterilir. */
function footLabel(foot: string, t: Translate): string {
  return foot === 'right' || foot === 'left' || foot === 'both' ? t(`foot.${foot}`) : foot;
}

function Bio({ p }: { p: Profile }) {
  const { t } = useTranslation('player');
  const { locale } = useI18n();
  const age = ageFromBirth(p.dateOfBirth);
  // Değeri olmayan alan HİÇ gösterilmez (boş satır/placeholder yok).
  // React anahtarı çeviri değil ALAN ADI: dil değişince liste yeniden oluşmasın.
  const items: Array<[string, string | null]> = [
    ['birthDate', p.dateOfBirth ? `${formatPlayerDate(p.dateOfBirth, locale)}${age != null ? ` (${age})` : ''}` : null],
    ['birthCity', p.birthCity ?? null],
    ['nationality', p.nationality?.name ?? null],
    ['height', p.heightCm ? `${p.heightCm} cm` : null],
    ['weight', p.weightKg ? `${p.weightKg} kg` : null],
    ['position', p.position ?? null],
    ['detailedPosition', p.detailedPosition ?? null],
    ['preferredFoot', p.preferredFoot ? footLabel(p.preferredFoot, t) : null],
  ];
  const shown = items.filter((i): i is [string, string] => i[1] != null);
  if (shown.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-bio">
      <h2 id="pp-bio" className={styles.cardTitle}>{t('bio.title')}</h2>
      <dl className={styles.bioGrid}>
        {shown.map(([k, v]) => (
          <div key={k} className={styles.bioItem}>
            <dt>{t(`bio.${k}`)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Sezon seçici: takım logosu + "sezon · lig · takım". Liste sezon (azalan) → takım (kronolojik) → turnuva (lig önce)
 * sırasıyla gelir; aynı sezonda takım değişince (transfer) ince bir ayraç çizilir. Yerel `<select>` logo/ayraç
 * gösteremediği için özel listbox (Karşılaştır seçicisiyle aynı popover dili).
 */
function SeasonPicker({ seasons, selected, onSelect }: { seasons: PlayerSeasonStats[]; selected: PlayerSeasonStats; onSelect: (key: string) => void }) {
  const { t } = useTranslation('player');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logo = (x: PlayerSeasonStats) =>
    x.teamLogo ? <img src={x.teamLogo} alt="" width={18} height={18} className={styles.teamLogo} /> : <span className={styles.logoPh} aria-hidden="true" />;

  return (
    <div className={styles.picker} ref={wrapRef}>
      <button type="button" className={styles.pickerBtn} aria-haspopup="listbox" aria-expanded={open} aria-label={t('summary.seasonSelect')} onClick={() => setOpen((o) => !o)}>
        {logo(selected)}
        <span className={styles.pickerText}>{seasonLabel(selected)}</span>
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul className={styles.pickerList} role="listbox" aria-label={t('summary.seasonSelect')}>
          {seasons.map((x, i) => {
            const prev = seasons[i - 1];
            const transfer = prev != null && prev.seasonName === x.seasonName && prev.teamId !== x.teamId;
            return (
              <li key={x.key} role="presentation" className={transfer ? styles.transferBreak : undefined}>
                <button
                  type="button"
                  role="option"
                  aria-selected={x.key === selected.key}
                  className={`${styles.pickerOption} ${x.key === selected.key ? styles.pickerOptionActive : ''}`.trim()}
                  onClick={() => {
                    onSelect(x.key);
                    setOpen(false);
                  }}
                >
                  {logo(x)}
                  <span className={styles.pickerText}>{seasonLabel(x)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function SeasonSummary({ seasons, selected, onSelect }: { seasons: PlayerSeasonStats[]; selected: PlayerSeasonStats; onSelect: (key: string) => void }) {
  const { t } = useTranslation('player');
  const s = selected.stats;
  const rating = s[STAT.RATING] as { average?: number; highest?: number; lowest?: number } | undefined;
  // İlk eleman React anahtarı + çeviri anahtarı (etiketin kendisi değil).
  const tiles: Array<[string, string | null, string?]> = [
    ['appearances', formatStat(s[STAT.APPEARANCES])],
    ['lineups', formatStat(s[STAT.LINEUPS])],
    ['minutes', formatStat(s[STAT.MINUTES])],
    ['goals', formatStat(s[STAT.GOALS])],
    ['assists', formatStat(s[STAT.ASSISTS])],
    ['rating', formatStat(s[STAT.RATING], 'rating'), rating?.highest != null && rating?.lowest != null ? `${rating.lowest.toFixed(1)} – ${rating.highest.toFixed(1)}` : undefined],
  ];
  return (
    <section className={styles.card} aria-labelledby="pp-season">
      <div className={styles.cardHead}>
        <h2 id="pp-season" className={styles.cardTitle}>{t('summary.title')}</h2>
        {seasons.length > 1 ? (
          <SeasonPicker seasons={seasons} selected={selected} onSelect={onSelect} />
        ) : (
          <span className={styles.seasonName}>{seasonLabel(selected)}</span>
        )}
      </div>
      <div className={styles.tiles}>
        {tiles.map(([key, value, sub]) => (
          <div key={key} className={styles.tile}>
            {key === 'rating' && value != null ? (
              // Sezon ortalaması iki ondalık yazılır; renk aynı skaladan (ham ortalamaya göre)
              <RatingBadge rating={rating?.average} text={value} size="md" className={styles.tileRating} />
            ) : (
              <span className={styles.tileValue}>{value ?? '—'}</span>
            )}
            <span className={styles.tileLabel}>{t(`summary.${key}`)}</span>
            {sub ? <span className={styles.tileSub}>{sub}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailedStats({ season }: { season: PlayerSeasonStats }) {
  const { t } = useTranslation('player');
  const { locale } = useI18n();
  const groups = PLAYER_STAT_GROUPS.map((g) => ({
    ...g,
    rows: g.stats
      .map((d) => ({ def: d, text: formatStat(season.stats[d.id], d.format, locale) }))
      .filter((r): r is { def: typeof r.def; text: string } => r.text != null),
  })).filter((g) => g.rows.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-stats">
      <h2 id="pp-stats" className={styles.cardTitle}>{t('detailed.title')}</h2>
      <div className={styles.groups}>
        {groups.map((g) => (
          <div key={g.key} className={styles.group}>
            <h3 className={styles.groupTitle}>{t(`statGroups.${g.key}`)}</h3>
            <ul className={styles.statList}>
              {g.rows.map(({ def, text }) => (
                <li key={def.id} className={styles.statRow}>
                  <span>{t(`stats.${def.labelKey}`)}</span>
                  <strong>{text}</strong>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function TeamCell({ t }: { t?: PlayerTransfer['fromTeam'] }) {
  if (!t) return <span className={styles.muted}>—</span>;
  const inner = (
    <>
      {t.logo ? <img src={t.logo} alt="" width={18} height={18} className={styles.teamLogo} loading="lazy" /> : null}
      <span className={styles.teamName}>{t.name}</span>
    </>
  );
  return t.id != null ? (
    <Link href={`/teams/${t.id}`} className={styles.teamCell} prefetch={false}>
      {inner}
    </Link>
  ) : (
    <span className={styles.teamCell}>{inner}</span>
  );
}

function Transfers({ items }: { items: PlayerTransfer[] }) {
  const { t } = useTranslation('player');
  const { locale } = useI18n();
  if (items.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-transfers">
      <h2 id="pp-transfers" className={styles.cardTitle}>{t('transfers.title')}</h2>
      <ul className={styles.compactList}>
        {items.map((row) => (
          <li key={row.id} className={styles.compactItem}>
            <div className={styles.compactMeta}>
              <span>{formatPlayerDate(row.date, locale)}</span>
              <span>
                {transferTypeLabel(row.type, t)}
                {!row.completed ? <span className={styles.pending}> · {t('transfers.pending')}</span> : null}
                {' · '}
                {formatTransferAmount(row.amount, t, locale) ?? '—'}
              </span>
            </div>
            <div className={styles.transferTeams}>
              <TeamCell t={row.fromTeam} />
              <span className={styles.arrow} aria-hidden="true">→</span>
              <TeamCell t={row.toTeam} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchHistory({ playerId, teamId }: { playerId: number; teamId: number }) {
  const { t } = useTranslation('player');
  const { locale } = useI18n();
  const h = usePlayerMatchHistory(playerId, teamId);
  return (
    <section className={styles.card} aria-labelledby="pp-matches">
      <h2 id="pp-matches" className={styles.cardTitle}>{t('matches.title')}</h2>
      {h.loading && h.rows.length === 0 ? (
        <PanelSkeleton rows={5} />
      ) : h.rows.length === 0 ? (
        <EmptyState>{t('matches.empty')}</EmptyState>
      ) : (
        <>
          <ul className={styles.compactList}>
            {h.rows.map((r: PlayerMatchRow) => (
              <li key={r.matchId} className={styles.compactItem}>
                <div className={styles.compactMeta}>
                  <span>{formatPlayerDate(r.date, locale)}</span>
                  <span className={styles.score}>{r.score ?? '—'}</span>
                </div>
                <Link href={`/matches/${r.matchId}`} className={styles.teamCell} prefetch={false}>
                  {r.opponentLogo ? <img src={r.opponentLogo} alt="" width={18} height={18} className={styles.teamLogo} loading="lazy" /> : null}
                  <span className={styles.teamName}>{r.isHome ? '' : '@ '}{r.opponent}</span>
                </Link>
                {r.inSquad ? (
                  <div className={styles.matchStats}>
                    <span>
                      {r.minutes ?? '—'} {t('matches.minutesUnit')}
                      {r.started === false ? <span className={styles.pending} title={t('matches.benched')}> ↑</span> : null}
                    </span>
                    <span className={styles.matchRating}>
                      {t('matches.rating')}{' '}
                      <RatingBadge rating={r.rating} showEmpty ariaLabel={`${t('matches.rating')} ${formatRating(r.rating) ?? '—'}`} />
                    </span>
                    <span>{t('matches.goalsShort')} {r.goals ?? '—'}</span>
                    <span>{t('matches.assistsShort')} {r.assists ?? '—'}</span>
                  </div>
                ) : (
                  <div className={styles.muted}>{t('matches.notInSquad')}</div>
                )}
              </li>
            ))}
          </ul>
          {h.hasMore ? (
            <button type="button" className={styles.showAll} onClick={h.expand}>
              {t('matches.showAll')}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Son 20 maçın rating grafiği (takım düzeyinde tek `fixtures/multi` isteği — bkz. `usePlayerRatingTrend`). */
function RatingTrend({ playerId, teamId }: { playerId: number; teamId: number }) {
  const { t } = useTranslation('player');
  const { series, summary, loading, error } = usePlayerRatingTrend(playerId, teamId);
  const n = series?.points.length ?? 0;
  return (
    <section className={styles.card} aria-labelledby="pp-rating-trend" data-testid="rating-trend">
      <div className={styles.cardHead}>
        <h2 id="pp-rating-trend" className={styles.cardTitle}>{t('ratingTrend.title')}</h2>
        {n > 0 ? <span className={styles.seasonName}>{t('ratingTrend.subtitle', { count: n })}</span> : null}
      </div>
      {loading && !series ? (
        <PanelSkeleton rows={4} />
      ) : error ? (
        <EmptyState>{t('ratingTrend.error')}</EmptyState>
      ) : !series || !summary ? (
        <EmptyState>{t('ratingTrend.empty')}</EmptyState>
      ) : (
        <RatingTrendChart series={series} summary={summary} />
      )}
      {series && series.missing > 0 ? (
        <p className={styles.trendNote} data-testid="rating-missing">{t('ratingTrend.missing', { count: series.missing })}</p>
      ) : null}
    </section>
  );
}

/* ─── Sayfa gövdesi ─── */

export default function PlayerProfile({ playerId }: { playerId: string }) {
  const { t } = useTranslation('player');
  const { data, isLoading } = usePlayerProfile(playerId);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(null);

  const season = useMemo(() => {
    if (!data || data.seasons.length === 0) return null;
    return data.seasons.find((s) => s.key === selectedSeasonKey) ?? pickDefaultSeason(data.seasons) ?? data.seasons[0];
  }, [data, selectedSeasonKey]);

  if (isLoading) return <PanelSkeleton rows={8} />;
  if (!data) return <EmptyState>{t('notFound')}</EmptyState>;

  const teamId = data.currentTeam?.id ?? season?.teamId ?? null;
  const hasStats = season != null && statMain(season.stats[STAT.APPEARANCES]) != null;

  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <div className={styles.main}>
          <Header p={data} />
          <Bio p={data} />
          {season && hasStats ? <SeasonSummary seasons={data.seasons} selected={season} onSelect={setSelectedSeasonKey} /> : null}
          {teamId != null ? <RatingTrend playerId={data.id} teamId={teamId} /> : null}
          {season && hasStats ? <DetailedStats season={season} /> : null}
        </div>
        <aside className={styles.side}>
          <Transfers items={data.transfers} />
          {teamId != null ? <MatchHistory playerId={data.id} teamId={teamId} /> : null}
        </aside>
      </div>
    </div>
  );
}
