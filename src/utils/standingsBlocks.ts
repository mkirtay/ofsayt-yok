import type { StandingsBlock } from '@/components/StandingsView';
import type { CompetitionTableData } from '@/services/liveScoreService';

/** Tek tablo ya da aşama/grup blokları → çizilecek bloklar (çok gruplu liglerde her grup ayrı tablo). */
export function toStandingsBlocks(data: CompetitionTableData | null | undefined, groupLabel: (name: string) => string): StandingsBlock[] {
  if (!data) return [];
  if (data.table?.length) return [{ key: 'all', rows: data.table }];
  const stages = data.stages ?? [];
  return stages.flatMap((s, si) =>
    (s.groups ?? [])
      .filter((g) => g.standings?.length)
      .map((g, gi) => ({
        key: `${si}-${g.id ?? gi}`,
        title: [stages.length > 1 ? s.stage?.name : undefined, g.name ? groupLabel(g.name) : undefined]
          .filter(Boolean)
          .join(' · ') || undefined,
        rows: g.standings!,
      })),
  );
}
