import type { NextApiRequest } from 'next';

export const POST_MAX_LENGTH = 280;
export const COMMENT_MAX_LENGTH = 280;
export const PAGE_SIZE = 20;

export function queryString(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v && typeof v === 'string' ? v : null;
}

/** JSON gövdeyi (nesne ya da JSON string) düz nesne olarak döndürür; geçersizse boş nesne. */
export function readJsonBody(req: NextApiRequest): Record<string, unknown> {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'string') {
    try {
      const parsed: unknown = JSON.parse(b);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return typeof b === 'object' ? (b as Record<string, unknown>) : {};
}

export function optionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v && v.length <= maxLength ? v : null;
}

export function optionalInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
}
