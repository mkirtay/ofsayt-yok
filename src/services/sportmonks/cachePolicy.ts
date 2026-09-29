/**
 * Sportmonks yanıtlarının paylaşımlı cache süresi (bkz. server/sportmonks/cachedFetch.ts).
 *
 * `fresh`: bu süre boyunca upstream'e hiç gidilmez (CDN `s-maxage` de buradan).
 * `stale`: kaydın Redis'te tutulduğu toplam süre — Sportmonks 429/5xx dönerse bu süre içindeki son
 * geçerli veri verilir.
 *
 * Maç listeleri İÇERİĞE göre: canlı ya da ±15 dk içinde başlayacak maç varsa 30 sn; yoksa sıradaki
 * başlama saatine (−15 dk) kadar, en fazla endpoint'in üst sınırı. Tamamen geçmiş tarihler 24 sa.
 * Böylece maçsız bir günde "bugün" listesi 30 sn'de bir değil, en fazla 5 dk'da bir tazelenir.
 */
import { mapSportmonksStateToPhase } from './stateMapping';

export type CacheTtl = { fresh: number; stale: number };

const MIN = 60;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const DAY_MS = DAY * 1000;

export const LIVE_TTL = 20;
export const ACTIVE_LIST_TTL = 30;
/** Başlama saatine bu kadar kala / geçe liste "aktif" sayılır. */
export const KICKOFF_WINDOW_SECONDS = 15 * MIN;
/** Sportmonks'un "yok" dediği tekil kaynak (fixture/oyuncu/takım id'si). */
export const NOT_FOUND_TTL = HOUR;

type FixtureLike = { state_id?: number | null; starting_at?: string | null; starting_at_timestamp?: number | null };

function kickoffMs(f: FixtureLike): number | null {
  if (typeof f.starting_at_timestamp === 'number') return f.starting_at_timestamp * 1000;
  if (!f.starting_at) return null;
  const t = Date.parse(`${f.starting_at.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? t : null;
}

function isLive(f: FixtureLike): boolean {
  if (f.state_id == null) return false;
  const phase = mapSportmonksStateToPhase(f.state_id);
  return phase === 'IN PLAY' || phase === 'HALF TIME BREAK';
}

function isNotStarted(f: FixtureLike): boolean {
  return f.state_id == null || mapSportmonksStateToPhase(f.state_id) === 'NOT STARTED';
}

/**
 * Maç listesinin taze kalma süresi: canlı / başlama penceresindeki maç → 30 sn; yoksa sıradaki
 * başlamaya (−15 dk) kadar, `max` ile sınırlı, en az 30 sn. Başlama saati geçmiş ama hâlâ "başlamadı"
 * görünen maç (durum güncellemesi gecikmiş) da aktif sayılır.
 */
export function fixtureListFreshSeconds(fixtures: FixtureLike[], max: number, now: number): number {
  let untilNext = Infinity;
  for (const f of fixtures) {
    if (isLive(f)) return ACTIVE_LIST_TTL;
    if (!isNotStarted(f)) continue;
    const k = kickoffMs(f);
    if (k == null) continue;
    const delta = (k - now) / 1000;
    if (Math.abs(delta) <= KICKOFF_WINDOW_SECONDS) return ACTIVE_LIST_TTL;
    // Başlama saati çoktan geçmiş, hâlâ NS (ertelenmiş/TBA değilse gecikmiş güncelleme) → sık bak ama
    // saatlerce eskiyse (ertelenmiş maç) listeyi kilitlemesin.
    if (delta < 0 && delta > -3 * HOUR) return ACTIVE_LIST_TTL;
    if (delta > 0) untilNext = Math.min(untilNext, delta - KICKOFF_WINDOW_SECONDS);
  }
  return Math.max(ACTIVE_LIST_TTL, Math.min(max, Math.floor(untilNext)));
}

function utcDay(now: number, offsetDays = 0): string {
  return new Date(now + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** fresh'e göre Redis'te tutma (stale) süresi: en az 10 dk, en çok 7 gün. */
function withStale(fresh: number, stale?: number): CacheTtl {
  return { fresh, stale: stale ?? Math.min(7 * DAY, Math.max(10 * MIN, fresh * 20)) };
}

function asList(data: unknown): FixtureLike[] {
  if (Array.isArray(data)) return data as FixtureLike[];
  if (data && typeof data === 'object') return [data as FixtureLike];
  return [];
}

/**
 * @param path `football/...` ya da `core/...` (baştaki/sondaki `/` olmadan)
 * @param data Sportmonks yanıtının `data` alanı; "sonuç yok" cevabında `undefined`
 */
export function sportmonksCacheTtl(path: string, data: unknown, now: number = Date.now()): CacheTtl {
  const p = path.replace(/^\/+|\/+$/g, '').toLowerCase();
  const [base, ...rest] = p.split('/');
  const r = base === 'football' || base === 'core' ? rest : [base!, ...rest];
  const [res, a, b] = r;

  if (base === 'core') return withStale(DAY);

  switch (res) {
    case 'livescores':
      return withStale(LIVE_TTL, 10 * MIN);

    case 'fixtures': {
      const today = utcDay(now);
      const yesterday = utcDay(now, -1);
      if (a === 'date' && b) {
        if (b < yesterday) return withStale(DAY);
        if (b > utcDay(now, 1)) return withStale(15 * MIN, DAY);
        return withStale(fixtureListFreshSeconds(asList(data), 5 * MIN, now), DAY);
      }
      if (a === 'between' && b && r[3]) {
        const from = b;
        const to = r[3];
        if (to < yesterday) return withStale(DAY);
        if (from > today) return withStale(15 * MIN, DAY);
        return withStale(fixtureListFreshSeconds(asList(data), 10 * MIN, now), DAY);
      }
      if (a === 'head-to-head' || a === 'multi') {
        return withStale(fixtureListFreshSeconds(asList(data), 6 * HOUR, now), DAY);
      }
      if (a && /^\d+$/.test(a)) {
        if (data == null || typeof data !== 'object' || Array.isArray(data)) return withStale(NOT_FOUND_TTL, NOT_FOUND_TTL);
        const f = data as FixtureLike;
        if (isLive(f)) return withStale(LIVE_TTL, DAY);
        if (isNotStarted(f)) return withStale(fixtureListFreshSeconds([f], 10 * MIN, now), DAY);
        const k = kickoffMs(f);
        // Yeni bitmiş maçta skor/istatistik düzeltmeleri gelebilir → 6 sa; 1 günden eski → 24 sa.
        return withStale(k != null && now - k > DAY_MS ? DAY : 6 * HOUR, 7 * DAY);
      }
      return withStale(5 * MIN);
    }

    case 'standings':
      return withStale(10 * MIN, DAY);
    case 'topscorers':
      return withStale(30 * MIN, DAY);

    case 'teams':
      if (a === 'search') return withStale(DAY);
      // `upcoming` include'u yaklaşan fikstür taşıyor (saat değişiklikleri) → fikstür gibi 15 dk.
      return withStale(data != null && typeof data === 'object' && 'upcoming' in (data as object) ? 15 * MIN : 6 * HOUR, DAY);
    case 'squads':
    case 'players':
    case 'coaches':
    case 'referees':
    case 'venues':
      return data == null ? withStale(NOT_FOUND_TTL, NOT_FOUND_TTL) : withStale(6 * HOUR, DAY);

    case 'leagues':
    case 'seasons':
    case 'stages':
    case 'rounds':
    case 'types':
    case 'states':
    case 'countries':
      return withStale(DAY, 7 * DAY);

    default:
      return withStale(5 * MIN);
  }
}
