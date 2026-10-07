/**
 * Tarayıcı belleği (localStorage): bugünkü sonuç (ana sayfa kartı için; girişsiz oyuncuda da) ve girişten sonra
 * gönderilecek bekleyen koşu (girişsiz bitirip "giriş yap" diyen oyuncu dönünce koşu tabloya yazılır). Kişisel veri yok.
 * Depolama kapalıysa her işlev sessizce boşa düşer.
 */
import type { ShotInput } from './sim';

export const LAST_RUN_KEY = 'oy_frikik_last';
export const PENDING_RUN_KEY = 'oy_frikik_pending';

export type LastRun = { day: string; level: number; score: number; cleared: number; recorded: boolean; rank?: number | null };
export type PendingRun = { day: string; seed: number; simVersion: number; shots: ShotInput[] };

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // depolama kapalı
  }
}

/** Yalnız verilen güne aitse (dünün sonucu bugün gösterilmez). */
export function readLastRun(day: string): LastRun | null {
  const v = read<LastRun>(LAST_RUN_KEY);
  return v && v.day === day && typeof v.level === 'number' && typeof v.score === 'number' ? v : null;
}

export function writeLastRun(v: LastRun): void {
  write(LAST_RUN_KEY, v);
}

export function readPendingRun(day: string): PendingRun | null {
  const v = read<PendingRun>(PENDING_RUN_KEY);
  return v && v.day === day && Array.isArray(v.shots) ? v : null;
}

export function writePendingRun(v: PendingRun | null): void {
  write(PENDING_RUN_KEY, v);
}
