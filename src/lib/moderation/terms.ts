/**
 * Filtre sözlüğü = temel JSON (src/config/moderationTerms.json, sürüm kontrollü, yanlış pozitif testli) + yöneticinin
 * eklediği ModerationTerm satırları (kod değişmeden; /admin/sikayetler → Kelime listesi). DB satırları instance başına
 * 60 sn önbellekte; DB hatasında temel liste ile devam edilir (filtre hiçbir zaman kapanmaz).
 *
 * Neden JSON + DB: temel liste kodla birlikte test edilir (yanlış pozitif listesi CI'da); acil ek / istisna ise deploy
 * beklemeden yönetici sayfasından yapılır. Yalnız DB olsaydı liste testsiz ve sürümsüz kalırdı; yalnız JSON olsaydı her
 * ek bir deploy isterdi.
 */
import base from '@/config/moderationTerms.json';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { compileDictionary, type CompiledDictionary, type FilterTerm, type TermMatch } from './textFilter';

const BASE_TERMS = base.terms as FilterTerm[];
const BASE_ALLOW = base.allow as string[];
const CACHE_MS = 60_000;

export const TERM_LEVELS = ['BLOCK', 'FLAG', 'ALLOW'] as const;
export type TermLevelDb = (typeof TERM_LEVELS)[number];
export const TERM_MATCHES: readonly TermMatch[] = ['exact', 'prefix', 'contains'];

let baseDict: CompiledDictionary | null = null;
let cached: { at: number; dict: CompiledDictionary } | null = null;

export function baseDictionary(): CompiledDictionary {
  baseDict ??= compileDictionary(BASE_TERMS, BASE_ALLOW);
  return baseDict;
}

type TermRow = { term: string; level: string; match: string; category: string };

/** Temel liste + DB satırları (saf; test edilebilir). */
export function mergeDictionary(rows: readonly TermRow[]): CompiledDictionary {
  const extra: FilterTerm[] = [];
  const allow: string[] = [...BASE_ALLOW];
  for (const r of rows) {
    if (r.level === 'ALLOW') allow.push(r.term);
    else if (r.level === 'BLOCK' || r.level === 'FLAG') {
      const m = (TERM_MATCHES as readonly string[]).includes(r.match) ? (r.match as TermMatch) : 'prefix';
      extra.push({ t: r.term, m, l: r.level === 'BLOCK' ? 'block' : 'flag', c: r.category || 'custom' });
    }
  }
  if (!extra.length && allow.length === BASE_ALLOW.length) return baseDictionary();
  return compileDictionary([...BASE_TERMS, ...extra], allow);
}

export async function getDictionary(now = Date.now()): Promise<CompiledDictionary> {
  if (cached && now - cached.at < CACHE_MS) return cached.dict;
  try {
    const rows = await prisma.moderationTerm.findMany({ select: { term: true, level: true, match: true, category: true } });
    cached = { at: now, dict: mergeDictionary(rows) };
  } catch (e) {
    captureError('moderation:terms', e);
    cached = { at: now, dict: baseDictionary() };
  }
  return cached.dict;
}

/** Yönetici ekleyince / silince bu instance hemen yeniden okur (diğerleri en geç 60 sn). */
export function invalidateDictionary(): void {
  cached = null;
}
