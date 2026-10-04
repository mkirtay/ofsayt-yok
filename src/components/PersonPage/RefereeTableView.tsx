import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import { refereeHref } from '@/utils/personUrl';
import { statBarWidths } from '@/utils/compareData';
import { FEW_MATCHES_THRESHOLD, isFewMatches, sortRefereeRows, type RefereeSortKey, type SortDir } from '@/utils/refereeTableSort';
import { REFEREE_TABLE_LEAGUES, refereeTablePath } from '@/config/refereeTableLeagues';
import type { RefereeLeagueTable, RefereeTableRow } from '@/server/people/refereeLeagueTable';
import { initials } from './RefereeView';
import styles from './personPage.module.scss';
import ts from './refereeTable.module.scss';

const COLUMNS: { key: RefereeSortKey; label: string; field: keyof RefereeTableRow }[] = [
  { key: 'matches', label: 'person.colMatches', field: 'matches' },
  { key: 'yellow', label: 'person.colYellowPm', field: 'yellowPerMatch' },
  { key: 'red', label: 'person.colRedPm', field: 'redPerMatch' },
  { key: 'penalties', label: 'person.colPenPm', field: 'penaltiesPerMatch' },
  { key: 'fouls', label: 'person.colFoulsPm', field: 'foulsPerMatch' },
  { key: 'var', label: 'person.colVarPm', field: 'varPerMatch' },
];

const firstQuery = (v: unknown) => (Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined);

/**
 * /hakemler: lig + sezon seçici, sıralanabilir hakem tablosu (SSR), iki hakem seçilince karşılaştırma (tablonun altında;
 * `?a=slug&b=slug` paylaşılabilir). Yalnız sayılar; vurgu / "daha iyi" yorumu yok.
 */
export default function RefereeTableView({ data }: { data: RefereeLeagueTable }) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const router = useRouter();
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { maximumFractionDigits: 2 });
  const fmt = (n: number | null) => (n == null ? '—' : nf.format(n));

  const [sort, setSort] = useState<{ key: RefereeSortKey; dir: SortDir }>({ key: 'matches', dir: 'desc' });
  const rows = useMemo(() => sortRefereeRows(data.rows, sort.key, sort.dir), [data.rows, sort]);

  // Seçim URL'den (paylaşılabilir); yalnız tabloda olan hakemler.
  const bySlug = useMemo(() => new Map(data.rows.map((r) => [r.slug, r])), [data.rows]);
  const [sel, setSel] = useState<{ a?: string; b?: string }>({});
  useEffect(() => {
    if (!router.isReady) return;
    const a = firstQuery(router.query.a);
    const b = firstQuery(router.query.b);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL → durum (yalnız router hazır olunca)
    setSel({ ...(a && bySlug.has(a) ? { a } : {}), ...(b && bySlug.has(b) && b !== a ? { b } : {}) });
  }, [router.isReady, router.query.a, router.query.b, bySlug]);

  const compareRef = useRef<HTMLElement>(null);
  const a = sel.a ? bySlug.get(sel.a) : undefined;
  const b = sel.b ? bySlug.get(sel.b) : undefined;
  useEffect(() => {
    if (a && b) compareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [a, b]);

  const writeUrl = (next: { a?: string; b?: string }) => {
    setSel(next);
    const q = new URLSearchParams();
    if (next.a) q.set('a', next.a);
    if (next.b) q.set('b', next.b);
    const path = window.location.pathname;
    void router.replace(q.toString() ? `${path}?${q.toString()}` : path, undefined, { shallow: true, scroll: false });
  };

  const toggle = (slug: string) => {
    if (sel.a === slug) return writeUrl({ ...(sel.b ? { a: sel.b } : {}) });
    if (sel.b === slug) return writeUrl({ ...(sel.a ? { a: sel.a } : {}) });
    if (!sel.a) return writeUrl({ a: slug, ...(sel.b ? { b: sel.b } : {}) });
    return writeUrl({ a: sel.a, b: slug });
  };

  const onSort = (key: RefereeSortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  const leagueName = (l: { nameKey: string }) => tl(`short.${l.nameKey}`);

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-labelledby="ref-table-title">
        <h1 id="ref-table-title" className={styles.sectionTitle} style={{ fontSize: 18 }}>
          {t('person.tableTitle', { league: leagueName(data.league), season: data.season.name })}
        </h1>
        <div className={ts.controls}>
          <nav className={ts.chips} aria-label={t('person.leagueLabel')}>
            {REFEREE_TABLE_LEAGUES.map((l) => (
              <Link
                key={l.slug}
                href={refereeTablePath(l.slug, null, true)}
                className={`${ts.chip} ${l.slug === data.league.slug ? ts.chipActive : ''}`.trim()}
                aria-current={l.slug === data.league.slug ? 'page' : undefined}
              >
                {leagueName(l)}
              </Link>
            ))}
          </nav>
          <select
              className={ts.seasonSelect}
              value={data.season.slug}
              aria-label={t('person.seasonLabel')}
              onChange={(e) => {
                const i = data.seasons.findIndex((s) => s.slug === e.target.value);
                void router.push(refereeTablePath(data.league.slug, e.target.value, i === 0));
              }}
            >
              {data.seasons.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
        </div>
        <p className={ts.intro}>{t('person.tableIntro')}</p>
        {rows.length === 0 ? (
          <p className={styles.empty}>{t('person.empty')}</p>
        ) : (
          <div className={styles.scroll}>
            <table className={styles.table} data-testid="referee-table">
              <thead>
                <tr>
                  <th>{t('person.colReferee')}</th>
                  {COLUMNS.map((c) => {
                    const active = sort.key === c.key;
                    return (
                      <th key={c.key} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className={ts.sortBtn} data-active={active || undefined} onClick={() => onSort(c.key)}>
                          {t(c.label)}
                          <span className={ts.arrow} aria-hidden="true">
                            {active ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th>{t('person.colCompare')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.refereeId} className={sel.a === r.slug ? ts.rowA : sel.b === r.slug ? ts.rowB : undefined} data-referee={r.slug}>
                    <td>
                      <span className={ts.refCell}>
                        <span className={ts.miniAvatar} aria-hidden="true">
                          {initials(r.name)}
                        </span>
                        <Link href={refereeHref(r.refereeId, r.name)} className={ts.refLink}>
                          {r.name}
                        </Link>
                        {isFewMatches(r) ? <span className={ts.fewBadge}>{t('person.fewMatches')}</span> : null}
                      </span>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key}>{c.key === 'matches' ? r.matches : fmt(r[c.field] as number | null)}</td>
                    ))}
                    <td>
                      <input
                        type="checkbox"
                        className={ts.check}
                        checked={sel.a === r.slug || sel.b === r.slug}
                        onChange={() => toggle(r.slug)}
                        aria-label={t('person.selectReferee', { name: r.name })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={styles.note}>
          {t('person.fewMatchesNote', { count: FEW_MATCHES_THRESHOLD })} {t('person.sampleNote')}
        </p>
      </section>

      <section ref={compareRef} className={styles.card} aria-labelledby="ref-compare" data-testid="referee-compare">
        <h2 id="ref-compare" className={styles.sectionTitle}>
          {t('person.compareTitle')}
        </h2>
        {a && b ? (
          <>
            <div className={ts.compareHead}>
              {[a, b].map((r, i) => (
                <div key={r.slug} className={`${ts.compareSide} ${i === 1 ? ts.compareSideB : ''}`.trim()}>
                  <Link href={refereeHref(r.refereeId, r.name)} className={ts.compareName}>
                    {r.name}
                  </Link>
                  <span className={ts.compareMeta}>
                    {data.season.name} · {r.matches} {t('person.colMatches').toLocaleLowerCase(locale === 'en' ? 'en' : 'tr')}
                  </span>
                </div>
              ))}
            </div>
            <div className={ts.bars}>
              {COLUMNS.map((c) => {
                const v1 = (a[c.field] as number | null) ?? 0;
                const v2 = (b[c.field] as number | null) ?? 0;
                const w = statBarWidths(v1, v2, 'count');
                const label = t(c.label);
                const s1 = c.key === 'matches' ? String(a.matches) : fmt(a[c.field] as number | null);
                const s2 = c.key === 'matches' ? String(b.matches) : fmt(b[c.field] as number | null);
                return (
                  <div key={c.key} className={ts.bar} role="group" aria-label={`${label}: ${a.name} ${s1}, ${b.name} ${s2}`}>
                    <div className={ts.barHead}>
                      <span className={ts.barVal}>{s1}</span>
                      <span className={ts.barLabel}>{label}</span>
                      <span className={`${ts.barVal} ${ts.barValRight}`}>{s2}</span>
                    </div>
                    <div className={ts.barTrack} aria-hidden="true">
                      <div className={ts.barHalf}>
                        <div className={`${ts.barFill} ${ts.fillA}`} style={{ width: `${w.left}%` }} />
                      </div>
                      <div className={ts.barHalf}>
                        <div className={`${ts.barFill} ${ts.fillB}`} style={{ width: `${w.right}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={ts.compareActions}>
              <button type="button" className={ts.linkBtn} onClick={() => writeUrl({})}>
                {t('person.compareClear')}
              </button>
            </div>
          </>
        ) : (
          <p className={styles.empty}>{t('person.compareHint')}</p>
        )}
      </section>
    </div>
  );
}
