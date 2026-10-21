/**
 * Sportmonks `predictedLineups` — kadro sekmesinin YEDEK "Muhtemel 11" kaynağı.
 *
 * Maç sayfasının ana isteğindeki `lineups` başlamamış maçta zaten tahmini kadro taşıyor (metadata 572 `confirmed:false`,
 * 2026-10-21 taramasında ŞL/AL/KL/SL/PL'de maça 5–6 gün kala dolu, ~13 gün kala boş). `predictedLineups` ayrı bir tahmin
 * (aynı maçta 17–21/22 oyuncu ortak); maça ≤ 2–3 gün kala doluyor (ŞL/AL/KL, Süper Lig; PL'de 3 gün kala henüz boş) ve
 * liste uçlarında (`fixtures/between`) include edilse de HİÇ gelmiyor — yalnız `fixtures/{id}`.
 *
 * Ana isteğe include olarak EKLENMEDİ: maçın durumu istekten önce bilinmiyor → include her maçın önbellek anahtarını
 * değiştirirdi (bitmiş eski maçlar yalnız-önbellek okunuyor, bkz. withSportmonksCacheOnly) ve bitmiş maçta gereksiz. Bunun
 * yerine istemci, yalnız başlamamış maçta `lineups` boşken ve başlamaya ≤ 3 gün varken bu ayrı, küçük isteği atar
 * (~15 KB, Fixture havuzu, başlamamış maçta önbellek ≤ 10 dk).
 *
 * Şekil (gerçek yanıt, `__fixtures__/predictedLineupsSuperLig.json`): yanıt anahtarı küçük harf `predictedlineups`; satırda
 * `type_id` 111384, `formation_field` "satır:sütun" (lineups ile aynı kural: 1 = kaleci), `jersey_number`; DİKKAT
 * `position_id` burada AYRINTILI mevki (158 = sağ bek), temel mevki (24–27) `player.position_id`'de. Yedek yok.
 */
import type { MatchLineupData } from '@/models/domain';
import { mapSportmonksLineups } from '../sportmonksKatman2Mapper';
import { sportmonksClientRequest } from '../sportmonksRuntimeClient';
import type { SportmonksFixture, SportmonksLineupPlayer, SportmonksLineupRow } from './types';

export const PREDICTED_LINEUPS_INCLUDE =
  'participants:name;' +
  'predictedLineups.player:display_name,image_path,position_id,detailed_position_id,nationality_id;' +
  'predictedLineups.player.nationality:name,image_path';

/** Tahmin bu kadar yakın maçta istenir: daha uzakta Sportmonks'ta hiç dolu görülmedi (boş istek atılmasın). */
export const PREDICTED_LINEUPS_WINDOW_MS = 3 * 24 * 60 * 60_000;

/** İlk 11 satır türü (bkz. sportmonksKatman2Mapper — 12 = yedek). */
const STARTER_LINEUP_TYPE_ID = 11;
/** Sportmonks temel mevkileri: 24 GK, 25 DF, 26 MF, 27 FW. */
const BASE_POSITION_IDS = new Set([24, 25, 26, 27]);

export type SportmonksPredictedLineupRow = Omit<SportmonksLineupRow, 'player' | 'details'> & {
  detailed_position_id?: number | null;
  player?: (SportmonksLineupPlayer & { position_id?: number | null }) | null;
};

export type SportmonksFixtureWithPredicted = SportmonksFixture & {
  predictedlineups?: SportmonksPredictedLineupRow[] | null;
};

/** Tahmin satırını kadro satırı şekline çevirir (ilk 11; temel mevki oyuncudan, ayrıntılı mevki satırdan yedek). */
function toLineupRow(row: SportmonksPredictedLineupRow): SportmonksLineupRow {
  const basePosition = row.player?.position_id ?? (BASE_POSITION_IDS.has(row.position_id) ? row.position_id : 0);
  const detailed = row.player?.detailed_position_id ?? row.detailed_position_id ?? null;
  return {
    id: row.id,
    fixture_id: row.fixture_id,
    player_id: row.player_id,
    team_id: row.team_id,
    position_id: basePosition,
    type_id: STARTER_LINEUP_TYPE_ID,
    formation_field: row.formation_field ?? null,
    formation_position: row.formation_position ?? null,
    player_name: row.player_name,
    ...(row.jersey_number != null ? { jersey_number: row.jersey_number } : {}),
    player: {
      id: row.player?.id ?? row.player_id,
      ...(row.player?.display_name ? { display_name: row.player.display_name } : {}),
      ...(row.player?.image_path ? { image_path: row.player.image_path } : {}),
      ...(detailed != null ? { detailed_position_id: detailed } : {}),
      ...(row.player?.nationality ? { nationality: row.player.nationality } : {}),
    },
  };
}

/**
 * Saf dönüştürücü: `predictedlineups` satırları → kadro verisi (her zaman `confirmed:false`, `source:'predicted'`).
 * Satır yoksa / iki takımdan biri eşleşmiyorsa `null` (bölüm hiç çizilmez).
 */
export function mapSportmonksPredictedLineups(fixture: SportmonksFixtureWithPredicted | null | undefined): MatchLineupData | null {
  const rows = fixture?.predictedlineups;
  if (!fixture || !rows || rows.length === 0) return null;
  const mapped = mapSportmonksLineups({ ...fixture, lineups: rows.map(toLineupRow), metadata: [] });
  if (!mapped || !mapped.lineup.home.players.length || !mapped.lineup.away.players.length) return null;
  return { ...mapped, confirmed: false, source: 'predicted' };
}

/** Tek maçın tahmini 11'i — hata FIRLATIR (hata ≠ veri yok); `null` yalnız gerçekten tahmin yok. */
export async function fetchPredictedLineups(matchId: string): Promise<MatchLineupData | null> {
  const envelope = await sportmonksClientRequest<SportmonksFixtureWithPredicted>('football', `/fixtures/${matchId}`, {
    include: PREDICTED_LINEUPS_INCLUDE,
  });
  return mapSportmonksPredictedLineups(envelope.data ?? null);
}

/** Tahmin istenmeli mi: maç başlamadı, kadro (resmî ya da tahmini) yok, başlamaya ≤ 3 gün. */
export function shouldLoadPredictedLineups(input: {
  phase: string;
  hasLineups: boolean;
  kickoffMs: number | null;
  now: number;
}): boolean {
  if (input.phase !== 'PRE' || input.hasLineups || input.kickoffMs == null) return false;
  const until = input.kickoffMs - input.now;
  return until > 0 && until <= PREDICTED_LINEUPS_WINDOW_MS;
}
