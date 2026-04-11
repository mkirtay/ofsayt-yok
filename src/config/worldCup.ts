export const WORLD_CUP_COMPETITION_ID = 362;

const WORLD_CUP_GROUP_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

function groupNameOrder(name?: string): number {
  const idx = WORLD_CUP_GROUP_ORDER.indexOf((name || '').toUpperCase());
  return idx >= 0 ? idx : 999;
}

export function sortWorldCupGroupsByName<T extends { name?: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => {
    const ao = groupNameOrder(a.name);
    const bo = groupNameOrder(b.name);
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '', 'tr');
  });
}
