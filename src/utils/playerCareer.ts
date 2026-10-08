/**
 * Oyuncu sayfası "Kariyer" kartı — `PlayerProfile.seasons`'tan SAF türetim (yeni Sportmonks isteği YOK; aynı
 * `players/{id}` yanıtı, proxy'de 30 dk cache'li).
 *
 * Kurallar (2026-10-09, 4 oyuncunun ham yanıtı + maç bazlı lineup verisiyle doğrulandı — bkz. docs/OYUNCU_KARIYER.md):
 * - `has_values:false` / detaysız satırlar mapper'da zaten elenir ve GÖSTERİLMEZ: bunlar çoğunlukla oyuncunun o sezon
 *   o takımda olmadığı sahte kayıtlar (Osimhen "Galatasaray 2023/24 ŞL", Kerem "Benfica 2023/24 ŞL") — "—" ile gösterilse
 *   yanlış kariyer bilgisi verirdi.
 * - Detayı olan ama maç sayısı (321) olmayan satır gösterilir (dakikası varsa): maç hücresi "—", toplama katılmaz.
 * - Gol (52) / asist (79) yoksa 0: Sportmonks sıfır değerli tipi yanıttan atıyor (eksik her değer lineup verisinde 0 çıktı).
 * - Gol = `total` (penaltı dahil; `goals` alanı penaltısız).
 * - Lig / kupa ayrımı `isCup` (Sportmonks `league.sub_type`).
 * - Takım / genel toplam "kısmi" bayrağı: bkz. `uncoveredSeasons`, `isCareerPartial`.
 */
import type { PlayerSeasonStats } from '@/services/playerProfile';
import { STAT, statMain } from '@/services/sportmonks/playerStatTypes';

export type CareerTotals = { apps: number; goals: number; assists: number };

export type CareerRow = {
  key: string;
  seasonName: string;
  teamId?: number;
  teamName?: string;
  teamLogo?: string;
  leagueName?: string;
  isCup: boolean;
  /** `null` → veri yok ("—"), toplama katılmaz. */
  apps: number | null;
  goals: number;
  assists: number;
};

export type CareerGroup = { kind: 'league' | 'cup'; rows: CareerRow[]; total: CareerTotals };

export type CareerTeamTotal = CareerTotals & {
  key: string;
  teamId?: number;
  teamName: string;
  teamLogo?: string;
  /** Kapsam dışı sezonu var → toplam eksik ("Kısmi veri" rozeti). */
  partial: boolean;
  /** Kupa satırı olup lig satırı olmayan, plan kapsamı dışı sezonlar (azalan). */
  partialSeasons: string[];
};

export type PlayerCareer = {
  /** Boş grup listede yer almaz; lig grubu her zaman önce. */
  groups: CareerGroup[];
  total: CareerTotals;
  /** Takım bazında (lig + kupa), en son oynanan takım önce. */
  teams: CareerTeamTotal[];
  /** En az bir satırda maç sayısı yok ("—" dipnotu gösterilir). */
  missingApps: boolean;
};

/** Genel toplam kısmi mi: en az bir takım toplamı kısmiyse (tek takımlı oyuncuda da `teams` dolu). */
export const isCareerPartial = (c: Pick<PlayerCareer, 'teams'>) => c.teams.some((t) => t.partial);

/** "2025/2026" → "2025/26"; tek yıllık sezon ("2025") olduğu gibi. */
export const shortSeasonName = (name: string) => name.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1/$2');

function toRow(s: PlayerSeasonStats): CareerRow | null {
  const apps = statMain(s.stats[STAT.APPEARANCES]);
  const minutes = statMain(s.stats[STAT.MINUTES]);
  // Sahaya çıktığına dair kanıt yoksa (yalnız kadro / yalnız rating vb.) satır kariyer tablosuna girmez.
  if (!((apps ?? 0) > 0 || (minutes ?? 0) > 0)) return null;
  return {
    key: s.key,
    seasonName: s.seasonName,
    ...(s.teamId != null ? { teamId: s.teamId } : {}),
    ...(s.teamName ? { teamName: s.teamName } : {}),
    ...(s.teamLogo ? { teamLogo: s.teamLogo } : {}),
    ...(s.leagueName ? { leagueName: s.leagueName } : {}),
    isCup: s.isCup,
    apps,
    goals: statMain(s.stats[STAT.GOALS]) ?? 0,
    assists: statMain(s.stats[STAT.ASSISTS]) ?? 0,
  };
}

/**
 * Kapsam dışı sezon: takımın o sezonda kupa satırı var ama lig satırı yok VE sezon, oyuncunun verideki en eski lig
 * sezonundan eski. Planda yerel ligler yalnız son sezonlardan (2024/25→) var, UEFA eski sezonlarıyla geliyor → Osimhen'in
 * Napoli'si yalnız Avrupa maçlarıyla görünür. "En eskiden eski" şartı, kapsanan bir sezonda yalnız kupada oynayan
 * oyuncuyu (yedek kaleci vb.) yanlışlıkla kısmi saymamak için; oyuncunun hiç lig satırı yoksa her kupa-yalnız sezon
 * kapsam dışı sayılır. Hiç satırı olmayan sezonlar (Avrupa'da da oynamadığı eski sezonlar) buradan görülemez — başlık
 * altındaki kapsam notu bunun için.
 */
function uncoveredSeasons(rows: CareerRow[], key: string, oldestLeague: string | null): string[] {
  const mine = rows.filter((r) => teamKey(r) === key);
  const league = new Set(mine.filter((r) => !r.isCup).map((r) => r.seasonName));
  const cupOnly = new Set(mine.filter((r) => r.isCup && !league.has(r.seasonName)).map((r) => r.seasonName));
  return [...cupOnly].filter((s) => oldestLeague == null || s < oldestLeague).sort().reverse();
}

const teamKey = (r: Pick<CareerRow, 'teamId' | 'teamName'>) => (r.teamId != null ? `id:${r.teamId}` : `name:${r.teamName ?? ''}`);

function sum(rows: CareerRow[]): CareerTotals {
  return rows.reduce<CareerTotals>(
    (t, r) => ({ apps: t.apps + (r.apps ?? 0), goals: t.goals + r.goals, assists: t.assists + r.assists }),
    { apps: 0, goals: 0, assists: 0 },
  );
}

/**
 * Girdi `mapPlayerProfile` sırasında (sezon azalan → sezon içinde takım kronolojik → lig önce). Tablo ters kronolojik
 * okunduğu için sezon içinde takım sırası ÇEVRİLİR (transferle gelinen takım üstte); takım içi sıra korunur.
 */
export function buildPlayerCareer(seasons: PlayerSeasonStats[]): PlayerCareer {
  const blocks = new Map<string, { firstIdx: number; teams: string[] }>();
  const rows = seasons
    .map((s, idx) => ({ row: toRow(s), idx }))
    .filter((x): x is { row: CareerRow; idx: number } => x.row != null)
    .map(({ row, idx }) => {
      const block = blocks.get(row.seasonName) ?? { firstIdx: idx, teams: [] };
      blocks.set(row.seasonName, block);
      const tk = teamKey(row);
      if (!block.teams.includes(tk)) block.teams.push(tk);
      return { row, idx, block, teamRank: block.teams.indexOf(tk) };
    })
    .sort((a, b) => a.block.firstIdx - b.block.firstIdx || b.teamRank - a.teamRank || a.idx - b.idx)
    .map((x) => x.row);

  const groups = (['league', 'cup'] as const)
    .map((kind) => {
      const list = rows.filter((r) => r.isCup === (kind === 'cup'));
      return { kind, rows: list, total: sum(list) };
    })
    .filter((g) => g.rows.length > 0);

  const teams = new Map<string, CareerTeamTotal>();
  for (const r of rows) {
    const k = teamKey(r);
    const t = teams.get(k) ?? {
      key: k,
      ...(r.teamId != null ? { teamId: r.teamId } : {}),
      teamName: r.teamName ?? '—',
      ...(r.teamLogo ? { teamLogo: r.teamLogo } : {}),
      apps: 0,
      goals: 0,
      assists: 0,
      partial: false,
      partialSeasons: [],
    };
    t.apps += r.apps ?? 0;
    t.goals += r.goals;
    t.assists += r.assists;
    teams.set(k, t);
  }

  const leagueSeasons = rows.filter((r) => !r.isCup).map((r) => r.seasonName).sort();
  const oldestLeague = leagueSeasons[0] ?? null;
  for (const t of teams.values()) {
    t.partialSeasons = uncoveredSeasons(rows, t.key, oldestLeague);
    t.partial = t.partialSeasons.length > 0;
  }
  return { groups, total: sum(rows), teams: [...teams.values()], missingApps: rows.some((r) => r.apps == null) };
}
