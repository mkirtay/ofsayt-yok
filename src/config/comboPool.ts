/**
 * Kombine aracının otomatik maç havuzu — TEK yerde düzenlenen kural tabanlı kapsam; elle seçim YOK. Kulüp kapsamı
 * `server/analysisPregen.ts` ile uyumludur (aynı lig kimlikleri; sabitlerin eşitliği comboPool.test.ts'te kaynak metninden doğrulanır),
 * milli kapsam `config/nationalLeagues.ts` kimliklerindendir. Her gün en çok `maxMatches` maç, önem puanıyla seçilir.
 * Saf (sunucu/istemci güvenli): tablo / saat bilgisi `PoolContext` ile dışarıdan gelir.
 */
export const COMBO_POOL = {
  /** Günlük havuzdaki en çok maç. */
  maxMatches: 10,
  /** Sportmonks kulüp ligleri. */
  superLig: 600,
  uefaClubLeagues: [2, 5, 2286] as readonly number[],
  bigFive: [8, 82, 301, 384, 564] as readonly number[],
  /** Genişletmek için: ek Sportmonks lig kimlikleri (taban puanı `extraLeagueScore`). */
  extraLeagueIds: [] as readonly number[],
  extraLeagueScore: 20,
  /** Büyük 5 ligde iki takım da tabloda ilk N'de ise kapsamda. */
  bigFiveTopRank: 6,
  turkeyCountryId: 404,
  /** Milli turnuvalar (API-Football ham lig kimliği) → taban puan. Türkiye maçı her zaman kapsamda. */
  nationalLeagueScores: {
    1: 45, // Dünya Kupası
    4: 45, // Avrupa Şampiyonası
    5: 35, // UEFA Uluslar Ligi
    37: 40, // DK Elemeleri play-off
    32: 32, // DK Elemeleri Avrupa
    960: 30, // Avrupa Şampiyonası Elemeleri
  } as Readonly<Record<number, number>>,
  /** Puan bileşenleri. */
  score: {
    superLig: 40,
    uclChampions: 45,
    uefaEuropa: 35,
    uefaConference: 30,
    bigFive: 30,
    turkeyBonus: 25,
    bothTopRankBonus: 15,
    nightPenalty: 20,
    /** Gece penceresi (Türkiye saati): [başlangıç, bitiş) — 00:00–06:00. */
    nightFromHour: 0,
    nightToHour: 6,
  },
} as const;

export type PoolInput = {
  matchId: string;
  /** Kulüp: Sportmonks lig kimliği. Milli: AF ham lig kimliği. */
  leagueId: number;
  national: boolean;
  homeTeamId: number | null;
  awayTeamId: number | null;
  /** Sportmonks takım ülke kimliği (kulüp); milli için kullanılmaz. */
  homeCountryId?: number | null;
  awayCountryId?: number | null;
  homeName: string;
  awayName: string;
  kickoffMs: number | null;
};

export type PoolContext = {
  /** Büyük 5 lig → tabloda ilk N takımın kimlikleri. */
  topTeamsByLeague?: ReadonlyMap<number, ReadonlySet<number>>;
};

export type PoolScore = { inScope: boolean; score: number; reasons: string[] };

const istanbulHour = (ms: number) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(ms));

const TURKEY_NAMES = new Set(['türkiye', 'turkiye', 'turkey']);
export const isTurkeyNational = (name: string): boolean => TURKEY_NAMES.has(name.trim().toLocaleLowerCase('tr'));

/** Bir maçın havuza uygunluğu ve önem puanı. Kapsam dışı → `inScope: false`. */
export function scorePoolMatch(m: PoolInput, ctx: PoolContext = {}): PoolScore {
  const P = COMBO_POOL;
  const reasons: string[] = [];
  let score = 0;
  let inScope = false;

  if (m.national) {
    const turkey = isTurkeyNational(m.homeName) || isTurkeyNational(m.awayName);
    const base = P.nationalLeagueScores[m.leagueId];
    if (base != null) {
      inScope = true;
      score += base;
      reasons.push('national-league');
    }
    if (turkey) {
      inScope = true;
      score += P.score.turkeyBonus;
      reasons.push('turkey');
    }
  } else {
    const turkishTeam = m.homeCountryId === P.turkeyCountryId || m.awayCountryId === P.turkeyCountryId;
    const top = ctx.topTeamsByLeague?.get(m.leagueId);
    const bothTop = Boolean(top && m.homeTeamId != null && m.awayTeamId != null && top.has(m.homeTeamId) && top.has(m.awayTeamId));
    if (m.leagueId === P.superLig) {
      inScope = true;
      score += P.score.superLig;
      reasons.push('super-lig');
      if (bothTop) score += P.score.bothTopRankBonus;
    } else if (P.uefaClubLeagues.includes(m.leagueId)) {
      inScope = true;
      score += m.leagueId === 2 ? P.score.uclChampions : m.leagueId === 5 ? P.score.uefaEuropa : P.score.uefaConference;
      reasons.push('uefa');
      if (turkishTeam) score += P.score.turkeyBonus;
    } else if (P.bigFive.includes(m.leagueId)) {
      if (bothTop) {
        inScope = true;
        score += P.score.bigFive + P.score.bothTopRankBonus;
        reasons.push('big5-top');
      }
    } else if (P.extraLeagueIds.includes(m.leagueId)) {
      inScope = true;
      score += P.extraLeagueScore;
      reasons.push('extra');
    }
  }

  if (inScope && m.kickoffMs != null) {
    const h = istanbulHour(m.kickoffMs);
    if (h >= P.score.nightFromHour && h < P.score.nightToHour) {
      score -= P.score.nightPenalty;
      reasons.push('night');
    }
  }
  return { inScope, score, reasons };
}

/** Günlük havuz: kapsamdaki maçlar önem puanına (eşitte başlama saatine) göre, en çok `max` tane. */
export function selectPool<T extends PoolInput>(items: readonly T[], ctx: PoolContext = {}, max: number = COMBO_POOL.maxMatches): Array<T & PoolScore> {
  return items
    .map((m) => ({ ...m, ...scorePoolMatch(m, ctx) }))
    .filter((m) => m.inScope && m.score > 0)
    .sort((a, b) => b.score - a.score || (a.kickoffMs ?? 0) - (b.kickoffMs ?? 0) || a.matchId.localeCompare(b.matchId))
    .slice(0, Math.max(0, max));
}

/** Bir lig tablosundaki ilk `rank` takımın kimlikleri (analysisPregen.topTeamIds ile aynı mantık; gruplu tablolar dahil). */
export function topTeamIdsFromTable(
  table: { table?: Array<{ rank: number; team?: { id?: unknown }; team_id?: unknown }>; stages?: Array<{ groups?: Array<{ standings?: Array<{ rank: number; team?: { id?: unknown }; team_id?: unknown }> }> }> } | null | undefined,
  rank: number = COMBO_POOL.bigFiveTopRank,
): Set<number> {
  const rows = [...(table?.table ?? []), ...(table?.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))];
  const ids = new Set<number>();
  for (const r of rows) {
    const id = Number(r.team?.id ?? r.team_id);
    if (Number.isFinite(id) && r.rank <= rank) ids.add(id);
  }
  return ids;
}
