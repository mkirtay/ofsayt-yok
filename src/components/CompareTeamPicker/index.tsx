import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from '@/lib/i18n';
import { useTeamSearch, type TeamHit } from '@/hooks/useTeamSearch';
import styles from './compareTeamPicker.module.scss';

interface CompareTeamPickerProps {
  fixedTeamId?: number;
  fixedTeamName?: string;
}

interface TeamFieldProps {
  id: string;
  label: string;
  value: TeamHit | null;
  onChange: (tm: TeamHit | null) => void;
  excludeId?: number;
}

/** Header aramasıyla aynı görsel dil: yazdıkça anlık filtrelenen, logo + isim sonuçlu popover. */
function TeamSearchField({ id, label, value, onChange, excludeId }: TeamFieldProps) {
  const { t } = useTranslation('match');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { teams, loading, active } = useTeamSearch(query, 8);
  const results = teams.filter((tm) => tm.id !== excludeId);

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

  return (
    <div className={styles.field} ref={wrapRef}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      {value ? (
        <button type="button" className={styles.selectedTeam} onClick={() => onChange(null)} aria-label={`${value.name} — ${t('compare.selectTeam')}`}>
          {value.logo ? <img src={value.logo} alt="" width={18} height={18} className={styles.logo} /> : <span className={styles.logoPh} />}
          <span className={styles.selectedName}>{value.name}</span>
          <span className={styles.change} aria-hidden="true">✕</span>
        </button>
      ) : (
        <div className={styles.searchWrap}>
          <svg className={styles.icon} viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            id={id}
            type="search"
            className={styles.input}
            placeholder="Takım ara…"
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open && active ? (
            <div className={styles.panel} role="listbox">
              {results.map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  className={styles.hit}
                  onClick={() => {
                    onChange(tm);
                    setQuery('');
                    setOpen(false);
                  }}
                >
                  {tm.logo ? <img src={tm.logo} alt="" width={20} height={20} className={styles.logo} /> : <span className={styles.logoPh} />}
                  <span className={styles.hitName}>{tm.name}</span>
                </button>
              ))}
              {loading && results.length === 0 && <div className={styles.note}>{t('compare.teamsLoading')}</div>}
              {!loading && results.length === 0 && <div className={styles.note}>{t('compare.noTeams')}</div>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function CompareTeamPicker({ fixedTeamId, fixedTeamName }: CompareTeamPickerProps) {
  const router = useRouter();
  const { t } = useTranslation('match');
  const isFixed = fixedTeamId != null;

  const [team1, setTeam1] = useState<TeamHit | null>(null);
  const [team2, setTeam2] = useState<TeamHit | null>(null);

  const team1Id = isFixed ? fixedTeamId : team1?.id;
  const canCompare = team1Id != null && team2 != null && team1Id !== team2.id;

  function handleCompare() {
    if (!canCompare || !team2) return;
    void router.push(`/compare/${team1Id}-vs-${team2.id}`);
  }

  return (
    <div className={styles.picker}>
      <div className={styles.teamRow}>
        {isFixed ? (
          <div className={styles.field}>
            <span className={styles.label}>{t('compare.team1')}</span>
            <div className={styles.fixedTeamBadge}>{fixedTeamName}</div>
          </div>
        ) : (
          <TeamSearchField id="compare-team1" label={t('compare.team1')} value={team1} onChange={setTeam1} excludeId={team2?.id} />
        )}

        <span className={styles.vsSep}>VS</span>

        <TeamSearchField id="compare-team2" label={t('compare.team2')} value={team2} onChange={setTeam2} excludeId={team1Id} />

        <button type="button" className={styles.compareBtn} disabled={!canCompare} onClick={handleCompare}>
          {t('compare.compare')}
        </button>
      </div>
    </div>
  );
}
