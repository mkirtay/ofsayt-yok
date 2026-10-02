/**
 * "Gece maçları" — seçili günün listesinin altında, ERTESİ Türkiye gününün 00:00–06:00 arasında başlayan maçlar
 * (Güney Amerika / MLS akşam maçları TSİ gece yarısından sonra başlar; takvimde ertesi güne düşer, kullanıcı için
 * "bu akşamın" maçıdır). Maçlar ertesi günün listesinde de kalır; bu bölüm yalnızca ek bir görünüm.
 * Saf modül: sunucu (`server/homeDay.ts`) ve istemci (`MatchHubPage`) aynı kuralı kullanır.
 */
import type { Match } from '@/models/liveScore';
import { shiftIsoDate } from '@/utils/dateStrip';
import { matchKickoffMs, matchIstanbulDate } from '@/utils/matchActivity';

/** Bu saatten (TSİ, hariç) önce başlayan ertesi gün maçları "gece maçı" sayılır. */
export const NIGHT_END_HOUR = 6;

const istanbulHourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' });

/** `date` gününün gece bölümünün Türkiye günü (= ertesi gün). */
export function nightDateOf(date: string): string {
  return shiftIsoDate(date, 1);
}

/** Maç `date` gününün gece bölümüne mi düşüyor: Türkiye'de ertesi gün, saat < `NIGHT_END_HOUR`. Saati bilinmeyen maç hayır. */
export function isNightMatchOf(m: Pick<Match, 'date' | 'scheduled'>, date: string): boolean {
  const k = matchKickoffMs(m as Pick<Match, 'status' | 'date' | 'scheduled'>);
  if (k == null) return false;
  if (matchIstanbulDate(m) !== nightDateOf(date)) return false;
  return Number(istanbulHourFormat.format(new Date(k))) < NIGHT_END_HOUR;
}

/** Listeden `date`'in gece maçları (id'ye göre tekil, giriş sırası korunur). */
export function selectNightMatches(matches: readonly Match[], date: string): Match[] {
  const byId = new Map<number, Match>();
  for (const m of matches) {
    const id = Number(m.id);
    if (Number.isFinite(id) && !byId.has(id) && isNightMatchOf(m, date)) byId.set(id, m);
  }
  return [...byId.values()];
}
