/** Milli maç detayı oran kartı verisi (YALNIZ sunucu): tek `odds?fixture=` isteği, kombine bütçe havuzu, 15 dk önbellek. */
import { toAfId } from '@/services/apiFootball/ids';
import { extractMatchOdds, type MatchOddsView } from '@/services/apiFootball/oddsMarkets';
import { loadAfOdds } from './afOdds';

export type NationalMatchOdds = { ok: true; odds: MatchOddsView | null } | { ok: false; reason: 'not-national' | 'error' };

export async function loadNationalMatchOdds(appMatchId: string, load: typeof loadAfOdds = loadAfOdds): Promise<NationalMatchOdds> {
  const afId = toAfId(appMatchId);
  if (afId == null) return { ok: false, reason: 'not-national' };
  const r = await load(afId);
  if (!r.ok) return { ok: false, reason: 'error' };
  return { ok: true, odds: extractMatchOdds(r.entry) };
}
