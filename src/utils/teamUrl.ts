/**
 * Takım sayfası adresi (SEO raporu 2026-11-16: adreste takım adı): `/teams/{id}-{ad}` (ör. /teams/34-galatasaray).
 * Maç adresleriyle aynı kalıp (id başta → eski `/teams/{id}` bağlantıları ayrıştırılır ve sayfada 301 ile kanoniğe gider).
 * Ad yoksa yalnız id (sayfa yine kanoniğe yönlendirir).
 */
import { slugify } from '@/utils/matchUrl';

export const TEAM_BASE_PATH = '/teams';

export function teamSlugParam(id: number | string, name?: string | null): string {
  const s = slugify(name ?? '');
  return s ? `${id}-${s}` : String(id);
}

export function teamHref(id: number | string, name?: string | null): string {
  return `${TEAM_BASE_PATH}/${teamSlugParam(id, name)}`;
}

/** "34-galatasaray" / "34" → "34"; geçersizse "". */
export function parseTeamIdParam(param: string | null | undefined): string {
  const m = /^(\d{1,12})(?:-[a-z0-9-]*)?$/.exec(param ?? '');
  return m ? m[1]! : '';
}
