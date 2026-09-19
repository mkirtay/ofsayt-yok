import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import EmptyState from '@/components/EmptyState';
import { PanelSkeleton } from '@/components/Skeleton';
import { usePlayerMatchHistory, usePlayerProfile } from '@/hooks/usePlayerProfile';
import { pickDefaultSeason, type PlayerMatchRow, type PlayerProfile as Profile, type PlayerSeasonStats, type PlayerTransfer } from '@/services/playerProfile';
import { PLAYER_STAT_GROUPS, STAT, formatStat, statMain } from '@/services/sportmonks/playerStatTypes';
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
export const transferTypeLabel = (t: string) => TRANSFER_TYPE_TR[t] ?? t;

/** Bedel para birimi yanıtta verilmiyor → sembolsüz "75 Mn"; yoksa (kiralık vb.) `null` (UI "—"). */
export function formatTransferAmount(amount: number | null | undefined): string | null {
  if (typeof amount !== 'number' || !(amount > 0)) return null;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} Mn`;
  if (amount >= 1_000) return `${Math.round(amount / 1_000).toLocaleString('tr-TR')} Bin`;
  return String(amount);
}

const DATE_FMT = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
export function formatDateTr(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '—' : DATE_FMT.format(d);
}

const seasonLabel = (s: PlayerSeasonStats) =>
  [s.seasonName, s.leagueName, s.teamName].filter(Boolean).join(' · ');

/* ─── Bölümler ─── */

function Header({ p }: { p: Profile }) {
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
          {age != null ? <span className={styles.chip}>{age} yaş</span> : null}
        </div>
      </div>
    </section>
  );
}

function Bio({ p }: { p: Profile }) {
  const age = ageFromBirth(p.dateOfBirth);
  // Değeri olmayan alan HİÇ gösterilmez (boş satır/placeholder yok).
  const items: Array<[string, string | null]> = [
    ['Doğum tarihi', p.dateOfBirth ? `${formatDateTr(p.dateOfBirth)}${age != null ? ` (${age})` : ''}` : null],
    ['Doğum şehri', p.birthCity ?? null],
    ['Uyruk', p.nationality?.name ?? null],
    ['Boy', p.heightCm ? `${p.heightCm} cm` : null],
    ['Kilo', p.weightKg ? `${p.weightKg} kg` : null],
    ['Pozisyon', p.position ?? null],
    ['Ayrıntılı pozisyon', p.detailedPosition ?? null],
    ['Tercih edilen ayak', p.preferredFoot ? (p.preferredFoot === 'right' ? 'Sağ' : p.preferredFoot === 'left' ? 'Sol' : p.preferredFoot === 'both' ? 'Her iki ayak' : p.preferredFoot) : null],
  ];
  const shown = items.filter((i): i is [string, string] => i[1] != null);
  if (shown.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-bio">
      <h2 id="pp-bio" className={styles.cardTitle}>Profil</h2>
      <dl className={styles.bioGrid}>
        {shown.map(([k, v]) => (
          <div key={k} className={styles.bioItem}>
            <dt>{k}</dt>
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
      <button type="button" className={styles.pickerBtn} aria-haspopup="listbox" aria-expanded={open} aria-label="Sezon seç" onClick={() => setOpen((o) => !o)}>
        {logo(selected)}
        <span className={styles.pickerText}>{seasonLabel(selected)}</span>
        <span className={styles.caret} aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul className={styles.pickerList} role="listbox" aria-label="Sezon seç">
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
  const s = selected.stats;
  const rating = s[STAT.RATING] as { average?: number; highest?: number; lowest?: number } | undefined;
  const tiles: Array<[string, string | null, string?]> = [
    ['Maç', formatStat(s[STAT.APPEARANCES])],
    ['İlk 11', formatStat(s[STAT.LINEUPS])],
    ['Dakika', formatStat(s[STAT.MINUTES])],
    ['Gol', formatStat(s[STAT.GOALS])],
    ['Asist', formatStat(s[STAT.ASSISTS])],
    ['Rating', formatStat(s[STAT.RATING], 'rating'), rating?.highest != null && rating?.lowest != null ? `${rating.lowest.toFixed(1)} – ${rating.highest.toFixed(1)}` : undefined],
  ];
  return (
    <section className={styles.card} aria-labelledby="pp-season">
      <div className={styles.cardHead}>
        <h2 id="pp-season" className={styles.cardTitle}>Sezon İstatistikleri</h2>
        {seasons.length > 1 ? (
          <SeasonPicker seasons={seasons} selected={selected} onSelect={onSelect} />
        ) : (
          <span className={styles.seasonName}>{seasonLabel(selected)}</span>
        )}
      </div>
      <div className={styles.tiles}>
        {tiles.map(([label, value, sub]) => (
          <div key={label} className={styles.tile}>
            <span className={styles.tileValue}>{value ?? '—'}</span>
            <span className={styles.tileLabel}>{label}</span>
            {sub ? <span className={styles.tileSub}>{sub}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function DetailedStats({ season }: { season: PlayerSeasonStats }) {
  const groups = PLAYER_STAT_GROUPS.map((g) => ({
    ...g,
    rows: g.stats
      .map((d) => ({ def: d, text: formatStat(season.stats[d.id], d.format) }))
      .filter((r): r is { def: typeof r.def; text: string } => r.text != null),
  })).filter((g) => g.rows.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-stats">
      <h2 id="pp-stats" className={styles.cardTitle}>Detaylı İstatistikler</h2>
      <div className={styles.groups}>
        {groups.map((g) => (
          <div key={g.key} className={styles.group}>
            <h3 className={styles.groupTitle}>{g.title}</h3>
            <ul className={styles.statList}>
              {g.rows.map(({ def, text }) => (
                <li key={def.id} className={styles.statRow}>
                  <span>{def.label}</span>
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
  if (items.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="pp-transfers">
      <h2 id="pp-transfers" className={styles.cardTitle}>Transferler</h2>
      <ul className={styles.compactList}>
        {items.map((t) => (
          <li key={t.id} className={styles.compactItem}>
            <div className={styles.compactMeta}>
              <span>{formatDateTr(t.date)}</span>
              <span>
                {transferTypeLabel(t.type)}
                {!t.completed ? <span className={styles.pending}> · tamamlanmadı</span> : null}
                {' · '}
                {formatTransferAmount(t.amount) ?? '—'}
              </span>
            </div>
            <div className={styles.transferTeams}>
              <TeamCell t={t.fromTeam} />
              <span className={styles.arrow} aria-hidden="true">→</span>
              <TeamCell t={t.toTeam} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MatchHistory({ playerId, teamId }: { playerId: number; teamId: number }) {
  const h = usePlayerMatchHistory(playerId, teamId);
  return (
    <section className={styles.card} aria-labelledby="pp-matches">
      <h2 id="pp-matches" className={styles.cardTitle}>Maç Geçmişi</h2>
      {h.loading && h.rows.length === 0 ? (
        <PanelSkeleton rows={5} />
      ) : h.rows.length === 0 ? (
        <EmptyState>Maç verisi bulunamadı.</EmptyState>
      ) : (
        <>
          <ul className={styles.compactList}>
            {h.rows.map((r: PlayerMatchRow) => (
              <li key={r.matchId} className={styles.compactItem}>
                <div className={styles.compactMeta}>
                  <span>{formatDateTr(r.date)}</span>
                  <span className={styles.score}>{r.score ?? '—'}</span>
                </div>
                <Link href={`/matches/${r.matchId}`} className={styles.teamCell} prefetch={false}>
                  {r.opponentLogo ? <img src={r.opponentLogo} alt="" width={18} height={18} className={styles.teamLogo} loading="lazy" /> : null}
                  <span className={styles.teamName}>{r.isHome ? '' : '@ '}{r.opponent}</span>
                </Link>
                {r.inSquad ? (
                  <div className={styles.matchStats}>
                    <span>{r.minutes ?? '—'} dk{r.started === false ? <span className={styles.pending} title="Yedekten girdi"> ↑</span> : null}</span>
                    <span>Rating {r.rating != null ? r.rating.toFixed(1) : '—'}</span>
                    <span>G {r.goals ?? '—'}</span>
                    <span>A {r.assists ?? '—'}</span>
                  </div>
                ) : (
                  <div className={styles.muted}>Kadroda yok</div>
                )}
              </li>
            ))}
          </ul>
          {h.hasMore ? (
            <button type="button" className={styles.showAll} onClick={h.expand}>
              Tümünü Göster
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ─── Sayfa gövdesi ─── */

export default function PlayerProfile({ playerId }: { playerId: string }) {
  const { data, isLoading } = usePlayerProfile(playerId);
  const [selectedSeasonKey, setSelectedSeasonKey] = useState<string | null>(null);

  const season = useMemo(() => {
    if (!data || data.seasons.length === 0) return null;
    return data.seasons.find((s) => s.key === selectedSeasonKey) ?? pickDefaultSeason(data.seasons) ?? data.seasons[0];
  }, [data, selectedSeasonKey]);

  if (isLoading) return <PanelSkeleton rows={8} />;
  if (!data) return <EmptyState>Oyuncu bulunamadı.</EmptyState>;

  const teamId = data.currentTeam?.id ?? season?.teamId ?? null;
  const hasStats = season != null && statMain(season.stats[STAT.APPEARANCES]) != null;

  return (
    <div className={styles.root}>
      <div className={styles.page}>
        <div className={styles.main}>
          <Header p={data} />
          <Bio p={data} />
          {season && hasStats ? <SeasonSummary seasons={data.seasons} selected={season} onSelect={setSelectedSeasonKey} /> : null}
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
