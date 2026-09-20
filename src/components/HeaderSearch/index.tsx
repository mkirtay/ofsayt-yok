import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { SIDEBAR_LEAGUES } from '@/config/leagues';
import { useTeamSearch } from '@/hooks/useTeamSearch';
import { useTranslation } from '@/lib/i18n';
import { resolveSidebarLeagueLogo } from '@/utils/leagueLogo';
import { normalizeSearchText } from '@/utils/searchText';
import styles from './headerSearch.module.scss';

export default function HeaderSearch({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('match');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();
  const { teams, loading, active } = useTeamSearch(query);

  // Ligler yerel listeden anında filtrelenir.
  const leagueHits = useMemo(() => {
    if (!active) return [];
    const q = normalizeSearchText(trimmed);
    return SIDEBAR_LEAGUES.filter((l) => normalizeSearchText(l.name).includes(q)).slice(0, 4);
  }, [active, trimmed]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function close() {
    setOpen(false);
    setQuery('');
    onNavigate?.();
  }

  const empty = active && !loading && teams.length === 0 && leagueHits.length === 0;

  return (
    <div className={styles.wrap} ref={wrapRef} role="search">
      <svg className={styles.icon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        type="search"
        className={styles.input}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && active ? (
        <div className={styles.panel}>
          {leagueHits.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t('search.leagues')}</div>
              {leagueHits.map((l) => {
                const logo = resolveSidebarLeagueLogo(l);
                return (
                  <Link key={l.id} href={`/?league=${l.id}`} className={styles.hit} onClick={close}>
                    {logo ? <img src={logo} alt="" width={18} height={18} className={styles.logo} /> : <span className={styles.logoPh} />}
                    <span>{l.name}</span>
                  </Link>
                );
              })}
            </>
          )}
          {teams.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t('search.teams')}</div>
              {teams.map((team) => (
                <Link key={team.id} href={`/teams/${team.id}`} className={styles.hit} onClick={close}>
                  {team.logo ? <img src={team.logo} alt="" width={18} height={18} className={styles.logo} /> : <span className={styles.logoPh} />}
                  <span>{team.name}</span>
                </Link>
              ))}
            </>
          )}
          {loading && teams.length === 0 && <div className={styles.note}>{t('search.searching')}</div>}
          {empty && <div className={styles.note}>{t('search.noResults')}</div>}
        </div>
      ) : null}
    </div>
  );
}
