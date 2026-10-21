/**
 * Haftanın / aşamanın istatistik özeti — saf dönüştürücüler (ağ yok). Kaynaklar (2026-10-21 gerçek isteklerle):
 *
 * - `statistics/rounds/{roundId}?include=participant` (RoundStatistic havuzu) ve `statistics/stages/{stageId}?include=participant`
 *   (StageStatistic havuzu): ~7–8 KB, 21–25 satır `{type_id, relation_id, value}`. Adlar `value` içinde geliyor; `participant`
 *   include'u çok biçimli (takım satırında takım, oyuncu satırında oyuncu, `image_path` dahil). Alan seçimi 400 veriyor.
 *   Aşama yanıtında MATCHES (188) satırı yok → oynanan maç sayısı gol ortalamasından / yüzdelerden türetilir.
 * - `stages/seasons/{seasonId}?include=rounds:name,starting_at,ending_at` (Stage havuzu, tek istek): sezonun aşamaları + haftaları.
 *   Haftanın `finished`/`is_current` bayrağı yerine tarih kullanılır (kayıt 24 sa önbellekte; bayrak bayatlar).
 *
 * Bahis çağrışımlı ad YOK: `GOAL_LINE` (alt/üst) yalnız "3+ gollü maç" oranı olarak, `BTTS` "iki takımın da gol attığı maç" olarak taşınır.
 */

/** Sportmonks istatistik tür id'leri (developer_name). */
export const ROUND_STAT_TYPES = {
  MATCHES: 188,
  DRAWS: 190,
  NUMBER_OF_GOALS: 191,
  BTTS: 192,
  CARDS: 193,
  SCORING_MINUTES: 196,
  GOAL_LINE: 197,
  WIN_PERCENTAGE: 201,
  DRAW_PERCENTAGE: 203,
  PARTICIPANT_MOST_SCORED: 204,
  GOAL_TOPSCORER: 208,
  ASSIST_TOPSCORER: 209,
  HIGHEST_RATED_PLAYER: 211,
  HIGHEST_RATED_TEAM: 212,
} as const;

export type RawStatParticipant = { id?: number; name?: string | null; display_name?: string | null; image_path?: string | null } | null;

export type RawRoundStatistic = {
  type_id: number;
  relation_id?: number | null;
  value?: Record<string, unknown> | null;
  participant?: RawStatParticipant;
};

export type StatEntity = { id: number; name: string; image: string | null };

export type RoundStatsSummary = {
  /** Oynanmış maç sayısı (>0; yoksa özet hiç üretilmez). */
  played: number;
  /** Haftadaki toplam maç (aşamada bilinmiyor → null). */
  scheduled: number | null;
  goals: { total: number; perMatch: number; home: number; away: number };
  /** İki takımın da gol attığı maçlar. */
  bothScored: { count: number; pct: number } | null;
  /** 3 ya da daha fazla gol olan maçlar (Sportmonks GOAL_LINE `over.2_5`). */
  threePlusGoals: { count: number; pct: number } | null;
  cards: { yellow: number; red: number; perMatch: number } | null;
  results: { homePct: number; drawPct: number; awayPct: number } | null;
  /** 15'er dakikalık gol dağılımı ("0-15" … "75-90"; uzatma dakikaları Sportmonks'ta son dilimlerde). */
  scoringMinutes: { bin: string; count: number; pct: number }[] | null;
  topPlayer: (StatEntity & { rating: number }) | null;
  topTeam: (StatEntity & { rating: number }) | null;
  mostGoalsTeam: (StatEntity & { goals: number }) | null;
  /** Yalnız 2+ golle (tek gollük eşitlikte Sportmonks alfabetik ilk oyuncuyu veriyor — anlamsız). */
  topScorer: (StatEntity & { goals: number }) | null;
  topAssist: (StatEntity & { assists: number }) | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

export function statEntity(row: RawRoundStatistic | undefined, idKey: string, nameKey: string): StatEntity | null {
  if (!row) return null;
  const v = obj(row.value) ?? {};
  const id = num(v[idKey]) ?? num(row.relation_id) ?? num(row.participant?.id);
  const name = (row.participant?.display_name || (typeof v[nameKey] === 'string' ? (v[nameKey] as string) : '') || row.participant?.name || '').trim();
  if (id == null || !name) return null;
  const image = typeof row.participant?.image_path === 'string' && row.participant.image_path.startsWith('https://') ? row.participant.image_path : null;
  return { id, name, image };
}

/** Sportmonks bazen "placeholder" görsel verir; ayırt etmek için yalnız yol sonu kontrol edilir. */
export function cleanStatImage(image: string | null): string | null {
  return image && !/placeholder/i.test(image) ? image : null;
}

function derivePlayed(by: Map<number, RawRoundStatistic>): number | null {
  const matches = obj(by.get(ROUND_STAT_TYPES.MATCHES)?.value);
  const played = num(matches?.played);
  if (played != null) return played;
  // Aşama yanıtında MATCHES yok: toplam gol / ortalama, olmazsa yüzdeli bir sayaçtan (count / pct).
  const goals = obj(by.get(ROUND_STAT_TYPES.NUMBER_OF_GOALS)?.value);
  const total = num(goals?.total);
  const avg = num(goals?.average);
  if (total != null && avg != null && avg > 0) return Math.round(total / avg);
  for (const t of [ROUND_STAT_TYPES.BTTS, ROUND_STAT_TYPES.DRAWS]) {
    const v = obj(by.get(t)?.value);
    const c = num(v?.count);
    const p = num(v?.percentage);
    if (c != null && p != null && p > 0) return Math.round((c * 100) / p);
  }
  const over = obj(obj(obj(by.get(ROUND_STAT_TYPES.GOAL_LINE)?.value)?.over)?.['0_5']);
  const under = obj(obj(obj(by.get(ROUND_STAT_TYPES.GOAL_LINE)?.value)?.under)?.['0_5']);
  const sum = (num(over?.count) ?? 0) + (num(under?.count) ?? 0);
  return sum > 0 ? sum : null;
}

/**
 * Ham istatistik satırları → kart özeti. Oynanmış maç yoksa (gelecek hafta, boş yanıt) `null` — "veri yok".
 */
export function summarizeRoundStatistics(rows: readonly RawRoundStatistic[] | null | undefined): RoundStatsSummary | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const by = new Map<number, RawRoundStatistic>();
  for (const r of rows) if (r && typeof r.type_id === 'number' && !by.has(r.type_id)) by.set(r.type_id, r);

  const played = derivePlayed(by);
  if (played == null || played <= 0) return null;
  const pct = (count: number) => round1((count * 100) / played);

  const goalsV = obj(by.get(ROUND_STAT_TYPES.NUMBER_OF_GOALS)?.value);
  const goalsTotal = num(goalsV?.total) ?? 0;
  const goals = {
    total: goalsTotal,
    perMatch: round2(num(goalsV?.average) ?? goalsTotal / played),
    home: num(obj(goalsV?.home)?.count) ?? 0,
    away: num(obj(goalsV?.away)?.count) ?? 0,
  };

  const bttsV = obj(by.get(ROUND_STAT_TYPES.BTTS)?.value);
  const bttsCount = num(bttsV?.count);
  // BTTS satırı hiç yoksa hiçbir maçta iki takım da gol atmamıştır (Sportmonks 0 olan türleri göndermiyor — DRAWS gibi).
  const bothScored = bttsV ? (bttsCount != null ? { count: bttsCount, pct: num(bttsV.percentage) ?? pct(bttsCount) } : null) : { count: 0, pct: 0 };

  const over25 = obj(obj(obj(by.get(ROUND_STAT_TYPES.GOAL_LINE)?.value)?.over)?.['2_5']);
  const overCount = num(over25?.count);
  const threePlusGoals = overCount != null ? { count: overCount, pct: num(over25?.percentage) ?? pct(overCount) } : null;

  const cardsV = obj(by.get(ROUND_STAT_TYPES.CARDS)?.value);
  const yellow = num(cardsV?.yellowcards);
  const red = (num(cardsV?.redcards) ?? 0) + (num(cardsV?.yellowredcards) ?? 0);
  // 3+ maçta hiç sarı kart yok = eksik veri (Türkiye Kupası 2026/27 sezon özeti: 51 maç, 0 sarı, 3 kırmızı) → gizli.
  const cards = yellow != null && !(yellow === 0 && played >= 3) ? { yellow, red, perMatch: round1((yellow + red) / played) } : null;

  const winV = obj(by.get(ROUND_STAT_TYPES.WIN_PERCENTAGE)?.value);
  const homePct = num(winV?.home);
  const awayPct = num(winV?.away);
  const drawPctRaw = num(obj(by.get(ROUND_STAT_TYPES.DRAW_PERCENTAGE)?.value)?.all);
  const results =
    homePct != null && awayPct != null
      ? { homePct: round1(homePct), awayPct: round1(awayPct), drawPct: round1(drawPctRaw ?? Math.max(0, 100 - homePct - awayPct)) }
      : null;

  const minutesV = obj(by.get(ROUND_STAT_TYPES.SCORING_MINUTES)?.value);
  const scoringMinutes = minutesV
    ? Object.entries(minutesV)
        .map(([bin, v]) => ({ bin, count: num(obj(v)?.count) ?? 0, pct: num(obj(v)?.percentage) ?? 0 }))
        .filter((b) => /^\d+-\d+$/.test(b.bin))
        .sort((a, b) => Number(a.bin.split('-')[0]) - Number(b.bin.split('-')[0]))
    : null;

  const withImage = <T extends StatEntity>(e: T | null): T | null => (e ? { ...e, image: cleanStatImage(e.image) } : null);

  const playerRow = by.get(ROUND_STAT_TYPES.HIGHEST_RATED_PLAYER);
  const playerRating = num(obj(playerRow?.value)?.rating);
  const player = statEntity(playerRow, 'player_id', 'player_name');
  const teamRow = by.get(ROUND_STAT_TYPES.HIGHEST_RATED_TEAM);
  const teamRating = num(obj(teamRow?.value)?.rating);
  const team = statEntity(teamRow, 'team_id', 'team_name');
  const scoredRow = by.get(ROUND_STAT_TYPES.PARTICIPANT_MOST_SCORED);
  const scoredCount = num(obj(scoredRow?.value)?.count);
  const scored = statEntity(scoredRow, 'participant_id', 'participant_name');
  const scorerRow = by.get(ROUND_STAT_TYPES.GOAL_TOPSCORER);
  const scorerCount = num(obj(scorerRow?.value)?.count);
  const scorer = statEntity(scorerRow, 'player_id', 'player_name');
  const assistRow = by.get(ROUND_STAT_TYPES.ASSIST_TOPSCORER);
  const assistCount = num(obj(assistRow?.value)?.count);
  const assister = statEntity(assistRow, 'player_id', 'player_name');

  return {
    played,
    scheduled: num(obj(by.get(ROUND_STAT_TYPES.MATCHES)?.value)?.total),
    goals,
    bothScored,
    threePlusGoals,
    cards,
    results,
    scoringMinutes: scoringMinutes && scoringMinutes.length > 0 ? scoringMinutes : null,
    topPlayer: player && playerRating != null ? withImage({ ...player, rating: round2(playerRating) }) : null,
    topTeam: team && teamRating != null ? withImage({ ...team, rating: round2(teamRating) }) : null,
    mostGoalsTeam: scored && scoredCount != null && scoredCount > 0 ? withImage({ ...scored, goals: scoredCount }) : null,
    topScorer: scorer && scorerCount != null && scorerCount >= 2 ? withImage({ ...scorer, goals: scorerCount }) : null,
    topAssist: assister && assistCount != null && assistCount >= 2 ? withImage({ ...assister, assists: assistCount }) : null,
  };
}

// ─── Hafta / aşama listesi ─────────────────────────────────────────────────

export type RawSeasonRound = { id: number; name?: string | null; starting_at?: string | null; ending_at?: string | null };

export type RawSeasonStage = {
  id: number;
  league_id?: number;
  season_id?: number;
  type_id?: number | null;
  name?: string | null;
  sort_order?: number | null;
  starting_at?: string | null;
  ending_at?: string | null;
  rounds?: RawSeasonRound[] | null;
};

export type StatUnitKind = 'round' | 'stage';

export type StatUnit = {
  kind: StatUnitKind;
  id: number;
  /** Hafta adı (çoğunlukla "8") ya da aşama adı (Sportmonks İngilizce: "League Stage", "Play-offs"). */
  name: string;
  /** Hafta birden fazla aşamada varsa (ör. normal sezon + play-off grubu) aşama adı; yoksa null. */
  stageName: string | null;
  start: string | null;
  end: string | null;
  /** Bitiş tarihi bugünden (TSİ) önce. */
  complete: boolean;
};

export type StatUnitMode = 'rounds' | 'stages';

/** `r410383` / `s77484090` — API ve istemci arasında birim anahtarı. */
export function statUnitKey(u: Pick<StatUnit, 'kind' | 'id'>): string {
  return `${u.kind === 'round' ? 'r' : 's'}${u.id}`;
}

export function parseStatUnitKey(raw: unknown): { kind: StatUnitKind; id: number } | null {
  if (typeof raw !== 'string') return null;
  const m = /^([rs])(\d{1,12})$/.exec(raw);
  return m ? { kind: m[1] === 'r' ? 'round' : 'stage', id: Number(m[2]) } : null;
}

const dateOnly = (v: string | null | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

function compareByStart(a: { start: string | null; name: string }, b: { start: string | null; name: string }): number {
  if (a.start && b.start && a.start !== b.start) return a.start < b.start ? -1 : 1;
  const na = Number(a.name);
  const nb = Number(b.name);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.name.localeCompare(b.name);
}

/**
 * Sezonun aşamaları → seçilebilir birimler (eskiden yeniye). Başlamamış birimler (başlangıç > bugün) çıkarılır.
 * - `rounds` (lig): haftası olan aşamanın her haftası bir birim; haftasız aşama (ör. play-off eşleşmeleri) tek birim.
 * - `stages` (kupa): her aşama bir birim (Şampiyonlar Ligi "Lig Aşaması" da tek özet).
 * @param today TSİ günü `YYYY-MM-DD`
 */
export function buildStatUnits(stages: readonly RawSeasonStage[] | null | undefined, mode: StatUnitMode, today: string): StatUnit[] {
  if (!Array.isArray(stages)) return [];
  const sorted = [...stages].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || compareByStart({ start: dateOnly(a.starting_at), name: a.name ?? '' }, { start: dateOnly(b.starting_at), name: b.name ?? '' }),
  );
  const stagesWithRounds = sorted.filter((s) => (s.rounds?.length ?? 0) > 0).length;
  const out: StatUnit[] = [];
  for (const s of sorted) {
    const stageName = (s.name ?? '').trim();
    const rounds: RawSeasonRound[] = mode === 'rounds' ? (s.rounds ?? []) : [];
    if (rounds.length > 0) {
      const units = rounds
        .map((r) => ({
          kind: 'round' as const,
          id: r.id,
          name: (r.name ?? '').trim() || String(r.id),
          stageName: stagesWithRounds > 1 && stageName ? stageName : null,
          start: dateOnly(r.starting_at),
          end: dateOnly(r.ending_at),
          complete: false,
        }))
        .sort(compareByStart);
      out.push(...units);
    } else {
      out.push({ kind: 'stage', id: s.id, name: stageName || String(s.id), stageName: null, start: dateOnly(s.starting_at), end: dateOnly(s.ending_at), complete: false });
    }
  }
  return out
    .filter((u) => u.start != null && u.start <= today)
    .map((u) => ({ ...u, complete: u.end != null && u.end < today }));
}

/**
 * Varsayılan birim: haftalarda son TAMAMLANAN hafta (yoksa son başlamış); aşamalarda son başlamış aşama (Şampiyonlar Ligi'nde
 * aylarca süren lig aşaması, ağustostaki play-off'tan daha ilgili).
 */
export function pickDefaultStatUnit(units: readonly StatUnit[], mode: StatUnitMode): StatUnit | null {
  if (units.length === 0) return null;
  if (mode === 'rounds') {
    for (let i = units.length - 1; i >= 0; i -= 1) if (units[i]!.complete) return units[i]!;
  }
  return units[units.length - 1]!;
}

/** Bugünün TSİ günü (`YYYY-MM-DD`). */
export function istanbulToday(now: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}
