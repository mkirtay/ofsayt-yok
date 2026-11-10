/**
 * Milli turnuva puan durumu: çok gruplu tabloyu (ör. Uluslar Ligi 14 grup) tek takımın / maçın grubuna indirger.
 * Maç sayfası varsayılan olarak yalnız maçın grubunu, takım sayfası takımın grubunu gösterir; saf fonksiyon.
 */
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';

type Row = CompetitionTableStandingRow;
type Group = { id?: number; name?: string; standings?: Row[] };

function groupsOf(data: CompetitionTableData): Group[] {
  return (data.stages ?? []).flatMap((s) => (s.groups ?? []) as Group[]).filter((g) => g.standings?.length);
}

export function standingsGroupCount(data: CompetitionTableData | null | undefined): number {
  return data ? groupsOf(data).length : 0;
}

export type ReducedStandings = { data: CompetitionTableData; groupName: string | null; groupCount: number };

/**
 * Verilen takımlardan birini içeren ilk grup. Tek grup / tek tablo / eşleşme yok → olduğu gibi (`groupName` null).
 * Dönen `data` tek tablodur (`table`); `stages` yoktur.
 */
export function reduceStandingsToTeamGroup(data: CompetitionTableData, teamIds: ReadonlyArray<number | undefined>): ReducedStandings {
  const groups = groupsOf(data);
  if (groups.length <= 1) return { data, groupName: groups[0]?.name ?? null, groupCount: groups.length };
  const ids = new Set(teamIds.filter((x): x is number => x != null).map(Number));
  const hit = groups.find((g) => g.standings!.some((r) => ids.has(Number(r.team_id ?? r.team?.id))));
  if (!hit) return { data, groupName: null, groupCount: groups.length };
  const { stages: _stages, ...rest } = data;
  void _stages;
  return { data: { ...rest, table: hit.standings! }, groupName: hit.name ?? null, groupCount: groups.length };
}

/** Tek grup görünümünde başlık: "<Turnuva> · <Grup>" (turnuva kimliği korunur: bölge renkleri vb. ona bakar). */
export function titleStandings(data: CompetitionTableData, groupLabel: string | null): { data: CompetitionTableData; title: string | undefined } {
  const base = data.competition?.name;
  const title = groupLabel ? [base, groupLabel].filter(Boolean).join(' · ') : base;
  if (!groupLabel || !data.competition) return { data, title };
  return { data: { ...data, competition: { ...data.competition, name: title ?? '' } }, title };
}

/** AF'de lig formu güvenilir dolmuyor ve dar kolonda yer yiyor: milli tabloda "Lig formu" sütunu çizilmesin. */
export function withoutStandingsForm(data: CompetitionTableData): CompetitionTableData {
  const strip = (rows: Row[] | undefined) => rows?.map(({ form: _form, ...rest }) => { void _form; return rest as Row; });
  return {
    ...data,
    ...(data.table ? { table: strip(data.table)! } : {}),
    ...(data.stages ? { stages: data.stages.map((s) => ({ ...s, groups: s.groups?.map((g) => ({ ...g, standings: strip(g.standings) })) })) } : {}),
  } as CompetitionTableData;
}
