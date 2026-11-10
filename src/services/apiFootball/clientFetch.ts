/**
 * Tarayıcıdan milli maç verisi: yalnız kendi BFF ucumuz (`/api/national/matches/[id]`), API-Football'a doğrudan gidilmez.
 * Maç + olaylar + istatistik + kadro tek yanıt → aynı id için eşzamanlı çağrılar (maç, istatistik, kadro) tek isteği paylaşır.
 */
import type { NationalMatchBundle } from './mapper';
import type { CompetitionTableData } from '@/services/liveScoreService';

export type NationalClientResult = { kind: 'found'; bundle: NationalMatchBundle } | { kind: 'missing' } | { kind: 'error' };

const TTL_MS = 10_000;
const inflight = new Map<string, { at: number; promise: Promise<NationalClientResult> }>();

async function request(id: string): Promise<NationalClientResult> {
  if (typeof window === 'undefined') return { kind: 'error' }; // sunucuda sayfa verisi resolveMatchPage'ten gelir
  try {
    const res = await fetch(`/api/national/matches/${encodeURIComponent(id)}`);
    if (res.status === 404) return { kind: 'missing' };
    if (!res.ok) return { kind: 'error' };
    return { kind: 'found', bundle: (await res.json()) as NationalMatchBundle };
  } catch {
    return { kind: 'error' };
  }
}

export function fetchNationalBundle(id: string): Promise<NationalClientResult> {
  const hit = inflight.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = request(id);
  inflight.set(id, { at: Date.now(), promise });
  void promise.then((r) => {
    if (r.kind === 'error') inflight.delete(id);
  });
  return promise;
}

/** Hata (geçici) → fırlatır; "yok" → null. Mevcut `fetchMatch*` sözleşmesi (hata ≠ veri yok). */
export async function fetchNationalBundleOrThrow(id: string): Promise<NationalMatchBundle | null> {
  const r = await fetchNationalBundle(id);
  if (r.kind === 'error') throw new Error('national match fetch failed');
  return r.kind === 'found' ? r.bundle : null;
}

/** Milli turnuva puan durumu (BFF). Hata → fırlatır (hata ≠ veri yok); yok → null. */
export async function fetchNationalStandings(appLeagueId: number | string): Promise<CompetitionTableData | null> {
  const res = await fetch(`/api/national/standings/${encodeURIComponent(String(appLeagueId))}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`national standings HTTP ${res.status}`);
  return (await res.json()) as CompetitionTableData;
}
