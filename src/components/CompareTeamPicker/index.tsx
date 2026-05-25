import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useTranslation } from '@/lib/i18n';
import { COMPARE_LEAGUE_GROUPS } from '@/config/leagues';
import type { CompareTeamItem } from '@/pages/api/compare/teams';
import styles from './compareTeamPicker.module.scss';

interface CompareTeamPickerProps {
  fixedTeamId?: number;
  fixedTeamName?: string;
}

export default function CompareTeamPicker({ fixedTeamId, fixedTeamName }: CompareTeamPickerProps) {
  const router = useRouter();
  const { t } = useTranslation('match');

  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [teams, setTeams] = useState<CompareTeamItem[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [team1Id, setTeam1Id] = useState(fixedTeamId != null ? String(fixedTeamId) : '');
  const [team2Id, setTeam2Id] = useState('');

  const leagues =
    COMPARE_LEAGUE_GROUPS.find((g) => g.countryName === selectedCountry)?.leagues ?? [];

  useEffect(() => {
    if (!selectedLeagueId) {
      setTeams([]);
      return;
    }
    let cancelled = false;
    setTeamsLoading(true);
    fetch(`/api/compare/teams?competitionId=${selectedLeagueId}`)
      .then((r) => r.json())
      .then((data: CompareTeamItem[]) => {
        if (!cancelled) setTeams(data);
      })
      .catch(() => { if (!cancelled) setTeams([]); })
      .finally(() => { if (!cancelled) setTeamsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedLeagueId]);

  const handleCountryChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedCountry(e.target.value);
    setSelectedLeagueId('');
    setTeams([]);
    if (!fixedTeamId) setTeam1Id('');
    setTeam2Id('');
  }, [fixedTeamId]);

  const handleLeagueChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedLeagueId(e.target.value);
    if (!fixedTeamId) setTeam1Id('');
    setTeam2Id('');
  }, [fixedTeamId]);

  const canCompare = team1Id && team2Id && team1Id !== team2Id;

  function handleCompare() {
    if (!canCompare) return;
    void router.push(`/compare/${team1Id}-vs-${team2Id}`);
  }

  const isFixed = fixedTeamId != null;

  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        <div className={styles.field}>
          <label className={styles.label}>{t('compare.country')}</label>
          <select
            className={styles.select}
            value={selectedCountry}
            onChange={handleCountryChange}
          >
            <option value="">{t('compare.selectCountry')}</option>
            {COMPARE_LEAGUE_GROUPS.map((g) => (
              <option key={g.countryName} value={g.countryName}>
                {g.countryName}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>{t('compare.league')}</label>
          <select
            className={styles.select}
            value={selectedLeagueId}
            onChange={handleLeagueChange}
            disabled={!selectedCountry}
          >
            <option value="">{t('compare.selectLeague')}</option>
            {leagues.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedLeagueId && (
        <div className={styles.teamRow}>
          <div className={styles.field}>
            <label className={styles.label}>
              {isFixed ? (
                <span className={styles.fixedLabel}>{fixedTeamName}</span>
              ) : (
                t('compare.team1')
              )}
            </label>
            {isFixed ? (
              <div className={styles.fixedTeamBadge}>{fixedTeamName}</div>
            ) : (
              <select
                className={styles.select}
                value={team1Id}
                onChange={(e) => {
                  setTeam1Id(e.target.value);
                  if (e.target.value === team2Id) setTeam2Id('');
                }}
                disabled={teamsLoading || teams.length === 0}
              >
                <option value="">{t('compare.selectTeam')}</option>
                {teams.map((tm) => (
                  <option key={tm.id} value={String(tm.id)}>
                    {tm.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span className={styles.vsSep}>VS</span>

          <div className={styles.field}>
            <label className={styles.label}>{t('compare.team2')}</label>
            <select
              className={styles.select}
              value={team2Id}
              onChange={(e) => setTeam2Id(e.target.value)}
              disabled={teamsLoading || teams.length === 0 || (!isFixed && !team1Id)}
            >
              <option value="">{t('compare.selectTeam')}</option>
              {teams
                .filter((tm) => String(tm.id) !== team1Id)
                .map((tm) => (
                  <option key={tm.id} value={String(tm.id)}>
                    {tm.name}
                  </option>
                ))}
            </select>
          </div>

          <button
            type="button"
            className={styles.compareBtn}
            disabled={!canCompare}
            onClick={handleCompare}
          >
            {t('compare.compare')}
          </button>
        </div>
      )}

      {teamsLoading && (
        <p className={styles.loading}>{t('compare.teamsLoading')}</p>
      )}

      {selectedLeagueId && !teamsLoading && teams.length === 0 && (
        <p className={styles.empty}>{t('compare.noTeams')}</p>
      )}
    </div>
  );
}
