import { useContext, useEffect, useMemo, useState } from 'react';
import { SessionContext } from 'next-auth/react';
import {
  COUNTERS_MAX_IDS,
  VIEW_DEDUP_SECONDS,
  canSeeMatchCounters,
  parseCounterMatchId,
  type MatchCountsMap,
} from '@/config/matchCounters';

const EMPTY: MatchCountsMap = {};
const CACHE_MS = 60_000;
/** id anahtarı → yanıt (60 sn). Liste ↔ maç sayfası geçişlerinde aynı istek tekrarlanmaz. */
const cache = new Map<string, { at: number; data: MatchCountsMap }>();
const inflight = new Map<string, Promise<MatchCountsMap>>();

async function fetchCounters(key: string): Promise<MatchCountsMap> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = fetch(`/api/matches/counters?ids=${key}`, { credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return EMPTY;
      const body = (await res.json()) as { counts?: MatchCountsMap };
      return body.counts ?? EMPTY;
    })
    .catch(() => EMPTY)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      inflight.delete(key);
      return data;
    });
  inflight.set(key, p);
  return p;
}
const ZERO = { views: 0, comments: 0 } as const;

/** Haritadan tek maçın sayısı: harita yoksa (yetki yok / yüklenmedi) null, maç haritada yoksa sıfır. */
export function countsFor(map: MatchCountsMap | null, matchId: string | number | null | undefined) {
  if (!map || matchId == null) return null;
  return map[String(matchId)] ?? ZERO;
}
const SEEN_PREFIX = 'mv-seen:';

/**
 * Sayı rozetini bu oturum görebilir mi. Oturum çözülene kadar false (bayrak açıksa hemen true).
 * Admin değilse sayaç isteği HİÇ atılmaz → sayı verisi istemciye gelmez.
 * `useSession` yerine bağlam doğrudan okunur: SessionProvider'sız ağaçta (testler, gömülü liste) atmaz, false döner.
 */
export function useCanSeeMatchCounters(): boolean {
  const session = useContext(SessionContext);
  return canSeeMatchCounters(session?.data?.user);
}

/**
 * Verilen maçların sayıları, TEK istekte (`/api/matches/counters?ids=…`). Yetki yoksa sorgu kapalı ve `null` döner
 * (yüklenirken de `null`: rozet çizilmez).
 * id listesi sıralanıp anahtar yapılır: canlı skor yenilemesi aynı maçlarla yeni dizi verse de istek tekrarlanmaz.
 * react-query yerine küçük modül önbelleği: QueryClientProvider'sız ağaçta da çalışır (liste her yerde kullanılıyor).
 */
export function useMatchCounters(ids: readonly (string | number)[]): MatchCountsMap | null {
  const allowed = useCanSeeMatchCounters();
  const key = useMemo(() => {
    const set = new Set<string>();
    for (const raw of ids) {
      const id = parseCounterMatchId(raw);
      if (id) set.add(id);
      if (set.size >= COUNTERS_MAX_IDS) break;
    }
    return [...set].sort().join(',');
  }, [ids]);
  const [result, setResult] = useState<{ key: string; data: MatchCountsMap } | null>(null);
  const active = allowed && key.length > 0;
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchCounters(key).then((data) => {
      if (!cancelled) setResult({ key, data });
    });
    return () => {
      cancelled = true;
    };
  }, [active, key]);
  return active && result?.key === key ? result.data : null;
}

function alreadyCounted(matchId: string, now: number): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(SEEN_PREFIX + matchId));
    return Number.isFinite(at) && at > 0 && now - at < VIEW_DEDUP_SECONDS * 1000;
  } catch {
    return false;
  }
}

function markCounted(matchId: string, now: number): void {
  try {
    window.sessionStorage.setItem(SEEN_PREFIX + matchId, String(now));
  } catch {
    /* gizli sekme / depolama kapalı: sunucu tarafı tekrar süzgeci yeter */
  }
}

/**
 * Maç detayı açılınca bir kez görüntülenme sayımı (sayfa CDN'de önbellekli → istemciden). Aynı sekmede 30 dk içinde
 * tekrar açılırsa istek atılmaz; sunucu da IP+UA ile tekrarları süzer. Otomasyon (`navigator.webdriver`) sayılmaz.
 * İstek boşta atılır: ilk görünümün kritik yoluna girmez.
 */
export function useMatchViewBeacon(matchIdRaw: string | number | null | undefined): void {
  const matchId = parseCounterMatchId(matchIdRaw ?? '');
  useEffect(() => {
    if (!matchId || typeof window === 'undefined') return;
    if (navigator.webdriver) return;
    const send = () => {
      const now = Date.now();
      if (alreadyCounted(matchId, now)) return;
      markCounted(matchId, now);
      const url = `/api/matches/${matchId}/view`;
      if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return;
      void fetch(url, { method: 'POST', keepalive: true, credentials: 'omit' }).catch(() => undefined);
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(send, { timeout: 4000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(send, 1500);
    return () => window.clearTimeout(t);
  }, [matchId]);
}
