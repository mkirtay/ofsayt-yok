import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { COMPARE_LEAGUE_GROUPS } from '@/config/leagues';
import { countryFlagImgSrc } from '@/utils/countryFlag';
import type { CompareTeamItem } from '@/pages/api/compare/teams';
import styles from './compareTeamPicker.module.scss';

interface CompareTeamPickerProps {
  /** Karşılaştırmanın bir tarafı zaten belli ise (takım sayfasından açılınca) */
  fixedTeamId?: number;
  fixedTeamName?: string;
}

export default function CompareTeamPicker({ fixedTeamId, fixedTeamName }: CompareTeamPickerProps) {
  const router = useRouter();

  const [selectedCountry, setSelectedCountry] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [teams, setTeams] = useState<CompareTeamItem[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [team1Id, setTeam1Id] = useState(fixedTeamId != null ? String(fixedTeamId) : '');
  const [team2Id, setTeam2Id] = useState('');

  const leagues =
    COMPARE_LEAGUE_GROUPS.find((g) => g.countryName === selectedCountry)?.leagues ?? [];

  // League değişince takım listesini çek
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

  // Ülke değişince ligi sıfırla
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

  const canCompare =
    team1Id && team2Id && team1Id !== team2Id;

  function handleCompare() {
    if (!canCompare) return;
    void router.push(`/compare/${team1Id}-vs-${team2Id}`);
  }

  const isFixed = fixedTeamId != null;

  return (
    <div className={styles.picker}>
      <div className={styles.pickerRow}>
        {/* Ülke */}
        <div className={styles.field}>
          <label className={styles.label}>Ülke</label>
          <select
            className={styles.select}
            value={selectedCountry}
            onChange={handleCountryChange}
          >
            <option value="">— Ülke seç —</option>
            {COMPARE_LEAGUE_GROUPS.map((g) => (
              <option key={g.countryName} value={g.countryName}>
                {g.countryName}
              </option>
            ))}
          </select>
        </div>

        {/* Lig */}
        <div className={styles.field}>
          <label className={styles.label}>Lig</label>
          <select
            className={styles.select}
            value={selectedLeagueId}
            onChange={handleLeagueChange}
            disabled={!selectedCountry}
          >
            <option value="">— Lig seç —</option>
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
          {/* Takım 1 */}
          <div className={styles.field}>
            <label className={styles.label}>
              {isFixed ? (
                <span className={styles.fixedLabel}>{fixedTeamName}</span>
              ) : (
                'Takım 1'
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
                <option value="">— Takım seç —</option>
                {teams.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <span className={styles.vsSep}>VS</span>

          {/* Takım 2 */}
          <div className={styles.field}>
            <label className={styles.label}>Takım 2</label>
            <select
              className={styles.select}
              value={team2Id}
              onChange={(e) => setTeam2Id(e.target.value)}
              disabled={teamsLoading || teams.length === 0 || (!isFixed && !team1Id)}
            >
              <option value="">— Takım seç —</option>
              {teams
                .filter((t) => String(t.id) !== team1Id)
                .map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
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
            Karşılaştır
          </button>
        </div>
      )}

      {teamsLoading && (
        <p className={styles.loading}>Takımlar yükleniyor…</p>
      )}

      {selectedLeagueId && !teamsLoading && teams.length === 0 && (
        <p className={styles.empty}>Bu lig için takım verisi bulunamadı.</p>
      )}
    </div>
  );
}
