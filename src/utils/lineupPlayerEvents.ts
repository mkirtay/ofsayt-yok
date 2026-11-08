import type { MatchEvent } from '@/models/domain';

/** Kadro görünümünde bir oyuncunun maç içi özeti (saha ikonları + ekran okuyucu etiketi). */
export type PlayerMatchEvents = {
  /** Normal + penaltı golleri (seri penaltılar hariç). */
  goals: number;
  ownGoals: number;
  assists: number;
  yellow: boolean;
  /** Doğrudan kırmızı ya da ikinci sarıdan kırmızı. */
  red: boolean;
  /** İkinci sarıdan kırmızı (ikon farklı). */
  secondYellow: boolean;
  /** Oyuna girdiği / oyundan çıktığı dakika. */
  subIn?: number;
  subOut?: number;
};

const SCORING = new Set(['GOAL', 'PENALTY']);

function empty(): PlayerMatchEvents {
  return { goals: 0, ownGoals: 0, assists: 0, yellow: false, red: false, secondYellow: false };
}

/**
 * Olaylardan oyuncu id'si → özet. Kaynak maç sayfasının tek `fixtures/{id}` isteğindeki `events` (ek istek yok):
 * gol/penaltı golü `player` = atan, `related_player` = asist; değişiklikte `player` = giren, `related_player` = çıkan.
 * Geri alınan (`rescinded`) olaylar ve seri penaltılar sayılmaz.
 */
export function buildPlayerEvents(events: readonly MatchEvent[] | null | undefined): Map<string, PlayerMatchEvents> {
  const out = new Map<string, PlayerMatchEvents>();
  const at = (id: number | undefined | null) => {
    if (!id) return null;
    const key = String(id);
    let v = out.get(key);
    if (!v) out.set(key, (v = empty()));
    return v;
  };
  for (const e of events ?? []) {
    if (e.rescinded) continue;
    const kind = e.event;
    if (SCORING.has(kind)) {
      const p = at(e.player?.id);
      if (p) p.goals += 1;
      const a = at(e.related_player?.id);
      if (a) a.assists += 1;
    } else if (kind === 'OWN_GOAL') {
      const p = at(e.player?.id);
      if (p) p.ownGoals += 1;
    } else if (kind === 'YELLOW_CARD') {
      const p = at(e.player?.id);
      if (p) p.yellow = true;
    } else if (kind === 'RED_CARD') {
      const p = at(e.player?.id);
      if (p) p.red = true;
    } else if (kind === 'YELLOW_RED_CARD') {
      const p = at(e.player?.id);
      if (p) {
        p.red = true;
        p.secondYellow = true;
      }
    } else if (kind === 'SUBSTITUTION') {
      const pin = at(e.player?.id);
      if (pin && pin.subIn == null) pin.subIn = e.time;
      const pout = at(e.related_player?.id);
      if (pout && pout.subOut == null) pout.subOut = e.time;
    }
  }
  return out;
}

export function hasAnyEvent(ev: PlayerMatchEvents | undefined): boolean {
  return Boolean(
    ev && (ev.goals || ev.ownGoals || ev.assists || ev.yellow || ev.red || ev.subIn != null || ev.subOut != null),
  );
}
