import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Match } from '@/models/liveScore';
import { fetchNationalStandings } from '@/services/apiFootball/clientFetch';
import type { CompetitionTableData } from '@/services/liveScoreService';
import { FOCUS_NATIONAL_TEAM_ID, pickNationalFocus, type NationalFocus } from '@/utils/nationalHomeStandings';
import { reduceStandingsToTeamGroup, titleStandings, withoutStandingsForm } from '@/utils/nationalStandings';

export type NationalHomeStandings = {
  /** Sol panel milli tabloyu göstersin mi (Türkiye maçı var, kullanıcı lig seçmedi, tablo yüklenmiyor / geldi). */
  active: boolean;
  loading: boolean;
  focus: NationalFocus | null;
  data: CompetitionTableData | null;
};

const INACTIVE: NationalHomeStandings = { active: false, loading: false, focus: null, data: null };

/**
 * Seçili günün maçlarında Türkiye milli takımı varsa (tablosu olan turnuvada) o turnuvanın Türkiye grubunu verir.
 * Kullanıcı lig seçtiyse / tablo yoksa / hata varsa `active: false` → Süper Lig (mevcut varsayılan) aynen kalır.
 * Veri maç sayfasıyla aynı önbellekli BFF ucundan (`/api/national/standings`); bayrak kapalıyken maç listesinde milli
 * maç olmadığı için sorgu hiç çalışmaz. `groupLabel`: grup adının görünen dildeki karşılığı.
 */
export function useNationalHomeStandings(matches: readonly Match[], userPickedLeague: boolean, groupLabel: (raw: string) => string): NationalHomeStandings {
  const focus = useMemo(() => (userPickedLeague ? null : pickNationalFocus(matches)), [matches, userPickedLeague]);
  const query = useQuery({
    queryKey: ['national-standings', focus?.competitionId ?? null],
    queryFn: () => fetchNationalStandings(focus!.competitionId),
    enabled: focus != null,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const data = useMemo(() => {
    if (!query.data) return null;
    const reduced = reduceStandingsToTeamGroup(query.data, [FOCUS_NATIONAL_TEAM_ID]);
    const titled = titleStandings(reduced.data, reduced.groupName ? groupLabel(reduced.groupName) : null);
    return withoutStandingsForm(titled.data);
  }, [query.data, groupLabel]);
  if (!focus) return INACTIVE;
  if (query.isLoading) return { active: true, loading: true, focus, data: null };
  if (!data) return INACTIVE; // tablo yok / hata → Süper Lig
  return { active: true, loading: false, focus, data };
}
