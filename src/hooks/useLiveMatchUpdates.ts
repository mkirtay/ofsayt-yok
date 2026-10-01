import { useEffect, useRef, useState } from 'react';
import type { Match } from '@/models/liveScore';
import type { LiveMatchPayload } from '@/server/liveMatch';
import { ACTIVE_WINDOW_MS, isMatchActive, isMatchLive, matchKickoffMs } from '@/utils/matchActivity';

export const LIVE_POLL_MS = 30_000;
export const LIVE_MAX_BACKOFF_MS = 5 * 60_000;
/** isMatchActive'in "saati geçmiş ama başlamamış" süresi (3 sa) + pay. */
const LATE_START_RECHECK_MS = 3 * 3_600_000 + 60_000;

/** Ardışık hata sayısına göre bekleme: 30 sn → 60 → 120 → 240 → en çok 5 dk. */
export function liveRetryDelayMs(failures: number): number {
  return failures <= 0 ? LIVE_POLL_MS : Math.min(LIVE_MAX_BACKOFF_MS, LIVE_POLL_MS * 2 ** failures);
}

/**
 * Maç detayında canlı güncelleme (`/api/matches/[id]/live`, kaynak: tüm canlı maçları tek seferde getiren inplay).
 * - Maç canlıyken (devre arası / uzatma / penaltılar dahil) ya da başlamaya ±15 dk / saati geçmiş ama başlamamış
 *   görünürken 30 sn'de bir; ilk istek sayfa verisinden 30 sn sonra.
 * - Sekme arka plandayken durur; öne gelince son istek 30 sn'den eskiyse hemen tazeler.
 * - Hata → üstel bekleme (en çok 5 dk). Maç bitince (`FINISHED`) son durum yazılır ve durur.
 */
export function useLiveMatchUpdates(
  matchId: string,
  match: Pick<Match, 'status' | 'date' | 'scheduled'> | null,
  onUpdate: (payload: LiveMatchPayload) => void,
): void {
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  // Başlamamış maç: aktif pencere (başlamadan 15 dk önce … saati geçmiş ama durum güncellenmemiş) zamanlayıcıyla
  // açılıp kapanır — render'da saat okunmaz.
  const [windowOpen, setWindowOpen] = useState(false);
  const notStarted = match?.status === 'NOT STARTED';
  const date = match?.date;
  const scheduled = match?.scheduled;
  useEffect(() => {
    if (!notStarted) return;
    const m = { status: 'NOT STARTED', date, scheduled };
    const kickoff = matchKickoffMs(m);
    if (kickoff == null) return;
    const check = () => setWindowOpen(isMatchActive(m, Date.now()));
    const timers = [window.setTimeout(check, 0)];
    const opensIn = kickoff - ACTIVE_WINDOW_MS - Date.now();
    if (opensIn > 0 && opensIn < 24 * 3_600_000) timers.push(window.setTimeout(check, opensIn + 1_000));
    // Gecikmiş başlama süresi bitince (bkz. isMatchActive) yeniden değerlendir.
    const closesIn = kickoff + LATE_START_RECHECK_MS - Date.now();
    if (closesIn > 0 && closesIn < 24 * 3_600_000) timers.push(window.setTimeout(check, closesIn));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [notStarted, date, scheduled]);

  const live = match ? isMatchLive(match) : false;
  const active = Boolean(matchId && match && (live || (notStarted && windowOpen)));

  useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    let failures = 0;
    let lastFetch = Date.now();
    let cancelled = false;

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, ms);
    };

    async function run() {
      if (cancelled || document.hidden) return; // gizliyken bekle; öne gelince visibilitychange tetikler
      try {
        const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/live`);
        if (cancelled) return;
        if (res.status === 404) return; // maç yok — durur
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as LiveMatchPayload;
        if (cancelled) return;
        failures = 0;
        lastFetch = Date.now();
        onUpdateRef.current(payload);
        if (payload.match.status === 'FINISHED') return; // son durum yazıldı — durur
      } catch {
        if (cancelled) return;
        failures += 1;
      }
      schedule(liveRetryDelayMs(failures));
    }

    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        return;
      }
      const since = Date.now() - lastFetch;
      schedule(failures > 0 ? liveRetryDelayMs(failures) : Math.max(0, LIVE_POLL_MS - since));
    };

    schedule(LIVE_POLL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [active, matchId]);
}
