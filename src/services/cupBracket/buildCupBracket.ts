/**
 * Sportmonks `stages/seasons/{id}?include=aggregates;fixtures…;fixtures.participants…;fixtures.scores…` yanıtı →
 * `CupBracket` (saf; test edilir). Doğrulanmış bulgular (2026-10-21):
 * - Aşama `type_id`: 223 lig/grup, 224 eleme, 225 ön eleme. Yanıt sırasız; `sort_order` Türkiye Kupası'nda tekrarlıyor
 *   → başlama tarihi + sort_order ile sıralanır. `finished` bayat olabilir (TK 25/26 1. tur `false`) → kullanılmaz.
 * - İki ayak: maçta `aggregate_id` + `leg` "1/2"/"2/2"; aşamada `aggregates[] {fixture_ids, detail, winner_participant_id}`.
 *   2. ayak oynanmadan aggregate olmayabilir → aynı aşamada aynı iki takımın "x/2" maçları eşleştirilir.
 * - Tek maç: `leg` "1/1", kazanan `participants[].meta.winner` (hükmen / federasyon kararında da dolu).
 * - Skor: yalnız CURRENT (1525, uzatma dahil) + PENALTY_SHOOTOUT (5) istenir (`filters=scoreTypes:1525,5`).
 * - Kurası çekilmemiş turlar yanıtta yok → şablondan boş kutu. Eşleşme bağlantısı (kazanan hangi maça) yalnız Dünya
 *   Kupası'nda `brackets` edges'te var → verilirse kullanılır, yoksa sonraki turda takım eşlemesiyle türetilir.
 */
import { slotOfStageName, type BracketSlotTemplate } from '@/config/cupBrackets';
import type { BracketSlot, CupBracket, CupLeg, CupRound, CupRoundStatus, CupTeam, CupTie } from './types';

export type RawParticipant = {
  id: number;
  name?: string | null;
  image_path?: string | null;
  meta?: { location?: string | null; winner?: boolean | null } | null;
};
export type RawScore = { type_id?: number | null; participant_id?: number | null; score?: { goals?: number | null; participant?: string | null } | null };
export type RawFixture = {
  id: number;
  aggregate_id?: number | null;
  leg?: string | null;
  placeholder?: boolean | null;
  state_id?: number | null;
  starting_at?: string | null;
  group_id?: number | null;
  participants?: RawParticipant[] | null;
  scores?: RawScore[] | null;
};
export type RawAggregate = { id: number; fixture_ids?: number[] | null; detail?: string | null; winner_participant_id?: number | null };
export type RawStage = {
  id: number;
  league_id?: number | null;
  type_id?: number | null;
  name?: string | null;
  sort_order?: number | null;
  starting_at?: string | null;
  fixtures?: RawFixture[] | null;
  aggregates?: RawAggregate[] | null;
};
/** `seasons/{id}/brackets` edges (yalnız Dünya Kupası'nda dolu). */
export type RawBracketEdge = { child_fixture_id?: number | null; parent_fixture_id?: number | null; parent_outcome?: string | null };

export const STAGE_TYPE_LEAGUE = 223;
export const STAGE_TYPE_KNOCKOUT = 224;
export const STAGE_TYPE_QUALIFYING = 225;
const SCORE_CURRENT = 1525;
const SCORE_PENALTIES = 5;
const STATE_NS = new Set([1, 10, 13, 16, 26]);
const STATE_LIVE = new Set([2, 3, 4, 6, 9, 11, 18, 19, 21, 22, 23, 25]);
const STATE_AET = 7;
const STATE_PEN = 8;
const STATE_AWARDED = new Set([14, 17]);
/** İptal / silinmiş: oynanmayacak, sonuç da yok. */
const STATE_VOID = new Set([12, 15, 20]);

export const isLegLive = (stateId: number) => STATE_LIVE.has(stateId);
export const isLegFinished = (stateId: number) => !STATE_NS.has(stateId) && !STATE_LIVE.has(stateId) && !STATE_VOID.has(stateId);

function toIso(startingAt: string | null | undefined): string | null {
  if (!startingAt) return null;
  const t = Date.parse(`${startingAt.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? new Date(t).toISOString().replace('.000Z', 'Z') : null;
}

const timeKey = (s: string | null | undefined) => toIso(s) ?? '9999';

function team(p: RawParticipant | undefined): CupTeam | null {
  if (!p || typeof p.id !== 'number') return null;
  return { id: p.id, name: p.name?.trim() || `#${p.id}`, logo: p.image_path || null };
}

function sides(f: RawFixture): { home: RawParticipant | undefined; away: RawParticipant | undefined } {
  const ps = f.participants ?? [];
  const home = ps.find((p) => p.meta?.location === 'home') ?? ps[0];
  const away = ps.find((p) => p.meta?.location === 'away' && p !== home) ?? ps.find((p) => p !== home);
  return { home, away };
}

function goalsOf(f: RawFixture, typeId: number, participantId: number | undefined): number | null {
  if (participantId == null) return null;
  const s = (f.scores ?? []).find((x) => x.type_id === typeId && x.participant_id === participantId);
  return typeof s?.score?.goals === 'number' ? s.score.goals : null;
}

function toLeg(f: RawFixture): CupLeg {
  const { home, away } = sides(f);
  const stateId = f.state_id ?? 1;
  const started = !STATE_NS.has(stateId) && !STATE_VOID.has(stateId);
  const hg = started ? goalsOf(f, SCORE_CURRENT, home?.id) : null;
  const ag = started ? goalsOf(f, SCORE_CURRENT, away?.id) : null;
  const ph = goalsOf(f, SCORE_PENALTIES, home?.id);
  const pa = goalsOf(f, SCORE_PENALTIES, away?.id);
  return {
    fixtureId: f.id,
    startingAt: toIso(f.starting_at),
    stateId,
    homeId: home?.id ?? null,
    awayId: away?.id ?? null,
    homeGoals: hg ?? (started ? 0 : null),
    awayGoals: ag ?? (started ? 0 : null),
    ...(ph != null && pa != null ? { pens: { home: ph, away: pa } } : {}),
  };
}

const legNumber = (f: RawFixture) => Number(/^(\d+)\//.exec(f.leg ?? '')?.[1] ?? 1);
const isTwoLegged = (f: RawFixture) => /\/2$/.test(f.leg ?? '');

/** Bir aşamanın maçları → eşleşmeler (iki ayak birleştirilir). */
function stageTies(stage: RawStage): CupTie[] {
  const fixtures = [...(stage.fixtures ?? [])].sort((a, b) => timeKey(a.starting_at).localeCompare(timeKey(b.starting_at)) || a.id - b.id);
  const aggregates = new Map((stage.aggregates ?? []).map((a) => [a.id, a]));
  const groups: { key: string; fixtures: RawFixture[]; aggregate?: RawAggregate }[] = [];
  const byKey = new Map<string, (typeof groups)[number]>();
  for (const f of fixtures) {
    let key: string;
    if (f.aggregate_id != null) key = `agg-${f.aggregate_id}`;
    else if (isTwoLegged(f)) {
      const ids = (f.participants ?? []).map((p) => p.id).sort((a, b) => a - b);
      key = ids.length === 2 ? `pair-${ids.join('-')}` : `fx-${f.id}`;
    } else key = `fx-${f.id}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, fixtures: [], ...(f.aggregate_id != null && aggregates.has(f.aggregate_id) ? { aggregate: aggregates.get(f.aggregate_id) } : {}) };
      byKey.set(key, g);
      groups.push(g);
    }
    g.fixtures.push(f);
  }
  return groups.map((g) => buildTie(g.key.startsWith('pair-') ? `fx-${g.fixtures[0]!.id}` : g.key, g.fixtures, g.aggregate));
}

function buildTie(id: string, fixtures: RawFixture[], aggregate: RawAggregate | undefined): CupTie {
  const ordered = [...fixtures].sort((a, b) => legNumber(a) - legNumber(b) || timeKey(a.starting_at).localeCompare(timeKey(b.starting_at)));
  const first = ordered[0]!;
  const placeholder = ordered.every((f) => f.placeholder === true);
  const { home: hp, away: ap } = sides(first);
  const home = placeholder ? null : team(hp);
  const away = placeholder ? null : team(ap);
  const legs = ordered.map(toLeg);
  const tie: CupTie = { id, home, away, legs, winnerId: null, nextTieId: null };
  if (!home || !away) return tie;

  const finished = legs.filter((l) => isLegFinished(l.stateId));
  const twoLegged = ordered.length > 1 || isTwoLegged(first);
  if (twoLegged && finished.length > 0) {
    let h = 0;
    let a = 0;
    for (const l of finished) {
      const homeIsTieHome = l.homeId === home.id;
      h += (homeIsTieHome ? l.homeGoals : l.awayGoals) ?? 0;
      a += (homeIsTieHome ? l.awayGoals : l.homeGoals) ?? 0;
    }
    tie.agg = { home: h, away: a, final: finished.length === legs.length && legs.length >= 2 };
  }

  const last = finished[finished.length - 1];
  if (last?.pens) {
    const homeIsTieHome = last.homeId === home.id;
    tie.pens = homeIsTieHome ? { home: last.pens.home, away: last.pens.away } : { home: last.pens.away, away: last.pens.home };
  }

  // Kazanan: aggregate → (tek maç) meta.winner → (iki ayak bitti) toplam / penaltı.
  const teamIds = new Set([home.id, away.id]);
  let winnerId: number | null = null;
  if (aggregate?.winner_participant_id != null && teamIds.has(aggregate.winner_participant_id)) winnerId = aggregate.winner_participant_id;
  if (winnerId == null && !twoLegged && last) {
    const w = (ordered[ordered.length - 1]!.participants ?? []).find((p) => p.meta?.winner === true);
    if (w && teamIds.has(w.id)) winnerId = w.id;
  }
  if (winnerId == null && tie.agg?.final) {
    if (tie.agg.home !== tie.agg.away) winnerId = tie.agg.home > tie.agg.away ? home.id : away.id;
    else if (tie.pens && tie.pens.home !== tie.pens.away) winnerId = tie.pens.home > tie.pens.away ? home.id : away.id;
  }
  tie.winnerId = winnerId;

  if (winnerId != null && last) {
    const detail = aggregate?.detail?.toLowerCase() ?? '';
    if (STATE_AWARDED.has(last.stateId)) tie.decidedBy = 'awarded';
    else if (last.stateId === STATE_PEN || detail.includes('penalt') || tie.pens) tie.decidedBy = 'pen';
    else if (last.stateId === STATE_AET || detail.includes('extra')) tie.decidedBy = 'et';
  }
  return tie;
}

function roundStatus(ties: CupTie[]): Exclude<CupRoundStatus, 'tbd' | 'current'> | 'started' {
  const decided = (t: CupTie) => t.winnerId != null || (t.legs.length > 0 && t.legs.every((l) => isLegFinished(l.stateId) || STATE_VOID.has(l.stateId)));
  if (ties.every(decided)) return 'done';
  return ties.some((t) => t.legs.some((l) => !STATE_NS.has(l.stateId) && !STATE_VOID.has(l.stateId))) ? 'started' : 'upcoming';
}

const teamIdsOf = (t: CupTie) => [t.home?.id, t.away?.id].filter((x): x is number => x != null);

/** Sonraki tur bağlantısı: edges (varsa) → yoksa sonraki turda bu eşleşmenin takımlarından birini içeren TEK eşleşme. */
function linkRounds(from: CupTie[], to: CupTie[], edges: RawBracketEdge[]): void {
  const tieByFixture = new Map<number, CupTie>();
  for (const t of to) for (const l of t.legs) tieByFixture.set(l.fixtureId, t);
  for (const t of from) {
    const viaEdge = edges
      .filter((e) => (e.parent_outcome ?? 'winner') === 'winner' && t.legs.some((l) => l.fixtureId === e.child_fixture_id))
      .map((e) => (e.parent_fixture_id != null ? tieByFixture.get(e.parent_fixture_id) : undefined))
      .find(Boolean);
    if (viaEdge) {
      t.nextTieId = viaEdge.id;
      continue;
    }
    const ids = t.winnerId != null ? [t.winnerId] : teamIdsOf(t);
    const hits = to.filter((n) => teamIdsOf(n).some((id) => ids.includes(id)));
    if (hits.length === 1) t.nextTieId = hits[0]!.id;
  }
}

/**
 * Dikey sıra finalden geriye: her turda eşleşmeler, sonraki turdaki "ebeveyn"lerinin sırasıyla (ebeveynin ev sahibi
 * tarafından gelen önce); bağlantısızlar sona (başlama sırasıyla).
 */
function orderFromFinal(rounds: CupTie[][]): void {
  for (let i = rounds.length - 2; i >= 0; i--) {
    const parents = rounds[i + 1]!;
    const pos = new Map(parents.map((p, idx) => [p.id, idx]));
    const sideRank = (t: CupTie) => {
      const p = parents.find((x) => x.id === t.nextTieId);
      if (!p) return 0;
      return p.home && teamIdsOf(t).includes(p.home.id) ? 0 : p.away && teamIdsOf(t).includes(p.away.id) ? 1 : 0.5;
    };
    const indexed = rounds[i]!.map((t, idx) => ({ t, idx }));
    indexed.sort((a, b) => {
      const pa = a.t.nextTieId != null && pos.has(a.t.nextTieId) ? pos.get(a.t.nextTieId)! : Infinity;
      const pb = b.t.nextTieId != null && pos.has(b.t.nextTieId) ? pos.get(b.t.nextTieId)! : Infinity;
      return pa - pb || sideRank(a.t) - sideRank(b.t) || a.idx - b.idx;
    });
    rounds[i] = indexed.map((x) => x.t);
  }
}

function placeholderTies(slot: BracketSlot, count: number): CupTie[] {
  return Array.from({ length: count }, (_, i) => ({ id: `tbd-${slot}-${i}`, home: null, away: null, legs: [], winnerId: null, nextTieId: null }));
}

export type BuildCupBracketInput = {
  leagueId: number;
  seasonId: number;
  stages: RawStage[];
  template: readonly BracketSlotTemplate[];
  edges?: RawBracketEdge[];
};

/** `null` = bu sezonda eleme verisi yok (sekme gizlenir). */
export function buildCupBracket({ leagueId, seasonId, stages, template, edges = [] }: BuildCupBracketInput): CupBracket | null {
  const sorted = [...stages]
    .filter((s) => s.league_id == null || s.league_id === leagueId)
    .sort((a, b) => timeKey(a.starting_at).localeCompare(timeKey(b.starting_at)) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const leagueStages = sorted.filter((s) => s.type_id === STAGE_TYPE_LEAGUE);
  const knockout = sorted.filter((s) => (s.type_id === STAGE_TYPE_KNOCKOUT || s.type_id === STAGE_TYPE_QUALIFYING) && (s.fixtures?.length ?? 0) > 0);
  if (knockout.length === 0 && leagueStages.length === 0) return null;

  const ls = leagueStages[leagueStages.length - 1];
  const leagueStage = ls
    ? {
        stageId: ls.id,
        name: ls.name ?? '',
        kind: (new Set((ls.fixtures ?? []).map((f) => f.group_id ?? null)).size > 1 || /group/i.test(ls.name ?? '') ? 'group' : 'league') as
          | 'group'
          | 'league',
      }
    : null;

  const slotted = new Map<BracketSlot, RawStage>();
  const early: RawStage[] = [];
  for (const s of knockout) {
    const slot = s.type_id === STAGE_TYPE_KNOCKOUT ? slotOfStageName(s.name ?? '') : null;
    if (slot && template.some((t) => t.slot === slot) && !slotted.has(slot)) slotted.set(slot, s);
    else early.push(s);
  }
  const hasLeagueFormat = leagueStages.some((s) => /league stage/i.test(s.name ?? ''));
  const activeTemplate = template.filter(
    (t) => !t.optional || slotted.has(t.slot) || (t.optional === 'ifLeagueStage' && hasLeagueFormat),
  );

  const earlyRounds: CupRound[] = early.map((s) => ({
    key: `stage-${s.id}`,
    stageId: s.id,
    name: s.name ?? '',
    slot: null,
    kind: s.type_id === STAGE_TYPE_QUALIFYING ? 'qualifying' : 'early',
    status: 'upcoming',
    ties: stageTies(s),
  }));

  const treeTies = activeTemplate.map((t) => {
    const s = slotted.get(t.slot);
    return s ? stageTies(s) : placeholderTies(t.slot, t.ties);
  });
  for (let i = 0; i < treeTies.length - 1; i++) linkRounds(treeTies[i]!, treeTies[i + 1]!, edges);
  orderFromFinal(treeTies);
  // Kurası çekilmemiş sonraki tura (boş kutular) konuma göre bağla: yarıya inen turda 2k,2k+1 → k; eşit sayıda k → k.
  for (let i = 0; i < treeTies.length - 1; i++) {
    const next = treeTies[i + 1]!;
    if (!next.every((t) => t.id.startsWith('tbd-'))) continue;
    const cur = treeTies[i]!;
    cur.forEach((t, r) => {
      const target = next.length * 2 === cur.length ? next[Math.floor(r / 2)] : next.length === cur.length ? next[r] : undefined;
      t.nextTieId = target?.id ?? null;
    });
  }

  const treeRounds: CupRound[] = activeTemplate.map((t, i) => {
    const s = slotted.get(t.slot);
    return { key: t.slot, stageId: s?.id ?? null, name: s?.name ?? '', slot: t.slot, kind: 'bracket', status: 'upcoming', ties: treeTies[i]! };
  });

  const rounds = [...earlyRounds, ...treeRounds];
  const raw = rounds.map((r) => (r.ties.length === 0 || r.ties.every((t) => t.id.startsWith('tbd-')) ? 'tbd' : roundStatus(r.ties)));
  // Sonraki bir tur başladıysa öncekiler bitmiş sayılır (ertelenip hiç oynanmayan tek maç turu "sürüyor" göstermesin).
  const lastActive = raw.reduce((acc, s, i) => (s === 'done' || s === 'started' ? i : acc), -1);
  let currentAssigned = false;
  rounds.forEach((r, i) => {
    const st = raw[i]!;
    if (st === 'tbd') r.status = 'tbd';
    else if (st === 'done' || i < lastActive) r.status = 'done';
    else if (st === 'started' || !currentAssigned) {
      r.status = 'current';
      currentAssigned = true;
    } else r.status = 'upcoming';
  });

  return { leagueId, seasonId, leagueStage, rounds };
}
