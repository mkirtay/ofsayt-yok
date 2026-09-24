/**
 * Sportmonks `standings/seasons/{id}` satırındaki `details[]` dizisini mevcut
 * `CompetitionTableStandingRow` şekline (`matches`/`won`/`drawn`/`lost`/
 * `goals_scored`/`goals_conceded`/`goal_diff`) pivotlar.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md Pass 4 "getCompetitionTableFull" +
 * Faz 3 kapsamında 2026-09-18'de atılan gerçek istek (`GET /standings/seasons/
 * 27965?include=participant;details.type`, La Liga, FC Barcelona 1. sıra —
 * `details[]`'te 22 satır: Overall/Home/Away × {Matches,Won,Draw,Lost,Scored,
 * Conceded} + Goal Difference + Home/Away/Overall Points).
 *
 * ÖNEMLİ TASARIM KARARI — `type.name` DEĞİL `type.developer_name` ÜZERİNDEN
 * PİVOT: Görev talimatı `type.name`'i (yazım hatası dahil, "Overal Goals
 * Scored") birebir kopyalamayı ve ona göre pivotlamayı öneriyordu — rapor bu
 * dosya yazılmadan önce yalnızca `type.name`'in var olduğunu biliyordu. Ama bu
 * görev kapsamında atılan GERÇEK istekte `type.developer_name` alanının da
 * mevcut olduğu görüldü (`"OVERALL_SCORED"`, `"HOME_WINS"` gibi) — bu, yazım
 * hatasına karşı bağışık, kod tarafından tasarlanmış bir makine-anahtarı ve
 * pivot için `type.name`'den OBJEKTİF OLARAK daha güvenilir. Migration'ın kendi
 * temel dersi ("dokümana/varsayıma değil gerçek response'a güven") burada
 * uygulandı: gerçek veri, görevin öngördüğünden daha iyi bir seçenek sundu, o
 * kullanıldı. `type.name` yine de `DEVELOPER_NAME_BY_NAME_FALLBACK` içinde
 * (typo dahil, birebir) bir GÜVENLİK AĞI olarak tutuluyor — `developer_name`
 * hiç gelmeyen bir satırda (örn. eski bir API sürümü) devreye girer.
 */
import type { SportmonksStandingDetail, SportmonksStandingRow } from './types';

export type PivotedStandingRow = {
  rank: number;
  points: number;
  matches: number;
  won: number;
  drawn: number;
  lost: number;
  goals_scored: number;
  goals_conceded: number;
  goal_diff: number;
  team_id: number;
  name: string;
  /** Takım kısaltması ("GAL") — `participant` include'unda zaten geliyor; alt liglerde çoğu zaman `null`. */
  short_code?: string;
  logo?: string;
  group_id?: number | null;
  stage_id?: number | null;
};

/**
 * `type.name`'in TAM/birebir (yazım hatası dahil) değerinden `developer_name`'e
 * çözüm — sadece `developer_name` eksikse kullanılan yedek yol.
 */
const DEVELOPER_NAME_BY_NAME_FALLBACK: Record<string, string> = {
  'Overall Matches Played': 'OVERALL_MATCHES',
  'Overall Won': 'OVERALL_WINS',
  'Overall Draw': 'OVERALL_DRAWS',
  'Overall Lost': 'OVERALL_LOST',
  'Overal Goals Scored': 'OVERALL_SCORED', // Pass 4: rapordaki gerçek yazım hatası, BİREBİR
  'Overall Goals Conceded': 'OVERALL_CONCEDED',
  'Goal Difference': 'OVERALL_GOAL_DIFFERENCE',
  'Overall Points': 'TOTAL_POINTS',
};

function developerNameOf(detail: SportmonksStandingDetail): string | null {
  return detail.type?.developer_name ?? DEVELOPER_NAME_BY_NAME_FALLBACK[detail.type?.name ?? ''] ?? null;
}

/** `developer_name` → pivotlanmış alan; sadece "Overall" (lig geneli) satırlar kullanılır, Home/Away atlanır. */
const FIELD_BY_DEVELOPER_NAME: Record<string, keyof PivotedStandingRow> = {
  OVERALL_MATCHES: 'matches',
  OVERALL_WINS: 'won',
  OVERALL_DRAWS: 'drawn',
  OVERALL_LOST: 'lost',
  OVERALL_SCORED: 'goals_scored',
  OVERALL_CONCEDED: 'goals_conceded',
  OVERALL_GOAL_DIFFERENCE: 'goal_diff',
};

function pivotDetails(details: SportmonksStandingDetail[] | undefined): Partial<PivotedStandingRow> {
  const out: Partial<PivotedStandingRow> = {};
  if (!details) return out;
  for (const detail of details) {
    const developerName = developerNameOf(detail);
    if (!developerName) continue;
    const field = FIELD_BY_DEVELOPER_NAME[developerName];
    if (!field) continue;
    (out as Record<string, number>)[field] = detail.value;
  }
  return out;
}

/**
 * Bir `standings/seasons/{id}` satırını pivotlar. `goal_diff` `details[]`'te
 * yoksa (`OVERALL_GOAL_DIFFERENCE` satırı eksikse) `goals_scored - goals_conceded`'dan
 * türetilir — Sportmonks normalde bunu doğrudan veriyor (Pass 4 örneğinde
 * doğrulandı: 28-6=22, gelen değerle birebir eşleşti) ama garanti değil.
 */
export function pivotStandingRow(row: SportmonksStandingRow): PivotedStandingRow {
  const pivoted = pivotDetails(row.details);
  const matches = pivoted.matches ?? 0;
  const won = pivoted.won ?? 0;
  const drawn = pivoted.drawn ?? 0;
  const lost = pivoted.lost ?? 0;
  const goals_scored = pivoted.goals_scored ?? 0;
  const goals_conceded = pivoted.goals_conceded ?? 0;
  const goal_diff = pivoted.goal_diff ?? goals_scored - goals_conceded;

  return {
    rank: row.position,
    points: row.points,
    matches,
    won,
    drawn,
    lost,
    goals_scored,
    goals_conceded,
    goal_diff,
    team_id: row.participant?.id ?? row.participant_id,
    name: row.participant?.name ?? '',
    ...(row.participant?.short_code ? { short_code: row.participant.short_code } : {}),
    ...(row.participant?.image_path ? { logo: row.participant.image_path } : {}),
    group_id: row.group_id ?? null,
    stage_id: row.stage_id ?? null,
  };
}
