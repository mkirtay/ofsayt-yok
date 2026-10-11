/**
 * Maç sonu (RECAP) Gündem taslağı — SAF, DÜZ template (LLM yok; her sayı/isim veriden gelir, veri yoksa cümle yazılmaz).
 * Yalnızca BİTMİŞ (FT/AET/FT-pen) ve "büyük maç" kapsamındaki (bkz. `previewReason`) maçlar; ayrıca en az bir koşul gerekir:
 * derbi · kırmızı kart · 3+ gol farkı · 5+ toplam gol · Süper Lig'de dört büyüklerden birinin yenilgisi · penaltılarla bitiş.
 * Koşul yoksa post yok. Türkçe ek uyumu riski nedeniyle takım adlarına ek getirilmez.
 */
import { POST_MAX_LENGTH } from '@/config/gundem';
import { SUPER_LIG } from '@/server/analysisPregen';
import { leagueDisplayName } from './leagueNames';
import { BIG_FOUR_TEAM_IDS, fixtureKickoffMs, homeAway, previewReason, type PreviewFixture } from './previewPost';

export const RECAP_FINISHED_STATE_IDS: readonly number[] = [5, 7, 8]; // FT, AET, FT-pen
/** Başlamasından bu yana en çok bu kadar geçmiş maçlar değerlendirilir (maç ~2 sa + güvenlik payı). */
export const RECAP_MAX_AGE_MS = 12 * 3_600_000;

export type RecapReason = 'derby' | 'red-card' | 'big-margin' | 'many-goals' | 'big-four-loss' | 'penalties';
export const RECAP_REASON_ORDER: readonly RecapReason[] = ['derby', 'big-four-loss', 'red-card', 'big-margin', 'many-goals', 'penalties'];

export type RecapCandidate = { fixture: PreviewFixture; homeId: number; awayId: number; scope: ReturnType<typeof previewReason> & string };

export const recapKey = (fixtureId: number) => `recap:${fixtureId}`;

export function currentScore(f: PreviewFixture): { home: number; away: number } | null {
  const rows = (f.scores ?? []).filter((r) => r.description === 'CURRENT');
  if (rows.length === 0) return null;
  const sum = (side: 'home' | 'away') => rows.filter((r) => r.score.participant === side).reduce((n, r) => n + (r.score.goals ?? 0), 0);
  return { home: sum('home'), away: sum('away') };
}

export function selectRecapCandidates(fixtures: PreviewFixture[], now: number): RecapCandidate[] {
  const out: RecapCandidate[] = [];
  for (const f of fixtures) {
    if (f.state_id == null || !RECAP_FINISHED_STATE_IDS.includes(f.state_id)) continue;
    const ko = fixtureKickoffMs(f);
    if (ko == null || ko > now || now - ko > RECAP_MAX_AGE_MS) continue;
    const scope = previewReason(f);
    const ha = homeAway(f);
    if (!scope || !ha || !currentScore(f)) continue;
    out.push({ fixture: f, homeId: ha.home.id, awayId: ha.away.id, scope });
  }
  return out;
}

/** Skor/durum temelli (ek istek gerektirmeyen) koşullar. */
export function cheapRecapReasons(c: RecapCandidate): RecapReason[] {
  const s = currentScore(c.fixture)!;
  const reasons: RecapReason[] = [];
  const diff = Math.abs(s.home - s.away);
  if (Number(c.fixture.league_id) === SUPER_LIG) {
    const homeBig = BIG_FOUR_TEAM_IDS.includes(c.homeId);
    const awayBig = BIG_FOUR_TEAM_IDS.includes(c.awayId);
    // Yalnız biri büyük ve o kaybettiyse "sürpriz" (iki büyük karşılaşırsa bu zaten derbi/üst düzey maç).
    if (homeBig !== awayBig && ((homeBig && s.home < s.away) || (awayBig && s.away < s.home))) reasons.push('big-four-loss');
  }
  if (diff >= 3) reasons.push('big-margin');
  if (s.home + s.away >= 5) reasons.push('many-goals');
  if (c.fixture.state_id === 8) reasons.push('penalties');
  return reasons;
}

export type RecapFacts = {
  kind: 'RECAP';
  fixtureId: number;
  reasons: RecapReason[];
  kickoffAt: string;
  homeName: string;
  awayName: string;
  leagueName: string | null;
  score: { home: number; away: number };
  redCards: number;
};

export type RecapDraft = { externalKey: string; body: string; facts: RecapFacts; warnings: string[] };

function sentence(r: RecapReason, ctx: { home: string; away: string; score: { home: number; away: number }; redCards: number; bigLoser: string | null }): string {
  const { home, away, score, redCards } = ctx;
  const winner = score.home > score.away ? home : score.away > score.home ? away : null;
  const diff = Math.abs(score.home - score.away);
  switch (r) {
    case 'derby':
      return winner ? `Derbinin galibi ${winner}.` : 'Derbi berabere bitti.';
    case 'big-four-loss':
      return `${ctx.bigLoser} bu maçı kaybetti.`;
    case 'red-card':
      return redCards === 1 ? 'Maçta 1 kırmızı kart çıktı.' : `Maçta ${redCards} kırmızı kart çıktı.`;
    case 'big-margin':
      return `${winner} ${diff} gol farkla kazandı.`;
    case 'many-goals':
      return `Maçta toplam ${score.home + score.away} gol atıldı.`;
    case 'penalties':
      return 'Maç penaltı atışlarıyla belli oldu.';
  }
}

/** Koşul yoksa `null` (post yok). En çok iki cümle: öncelik sırası `RECAP_REASON_ORDER`. */
export function buildRecapDraft(c: RecapCandidate, reasons: RecapReason[], redCards: number): RecapDraft | null {
  const ha = homeAway(c.fixture);
  const score = currentScore(c.fixture);
  const ko = fixtureKickoffMs(c.fixture);
  if (!ha || !score || ko == null || reasons.length === 0) return null;
  const home = ha.home.name ?? '';
  const away = ha.away.name ?? '';
  if (!home || !away) return null;
  const leagueName = leagueDisplayName(c.fixture.league_id, null);
  const bigLoser = BIG_FOUR_TEAM_IDS.includes(c.homeId) && score.home < score.away ? home : BIG_FOUR_TEAM_IDS.includes(c.awayId) && score.away < score.home ? away : null;
  const ordered = RECAP_REASON_ORDER.filter((r) => reasons.includes(r));
  const head = `Maç sonu: ${home} ${score.home}-${score.away} ${away}${leagueName ? ` (${leagueName})` : ''}`;
  const lines = ordered.slice(0, 2).map((r) => sentence(r, { home, away, score, redCards, bigLoser }));
  const body = [head, ...lines].join('\n');
  const fallback = [head, lines[0]].join('\n');
  const final = body.length <= POST_MAX_LENGTH ? body : fallback.length <= POST_MAX_LENGTH ? fallback : null;
  if (!final) return null;
  return {
    externalKey: recapKey(c.fixture.id),
    body: final,
    warnings: [],
    facts: { kind: 'RECAP', fixtureId: c.fixture.id, reasons: ordered, kickoffAt: new Date(ko).toISOString(), homeName: home, awayName: away, leagueName, score, redCards },
  };
}

/** Sportmonks olay tipleri: 20 = kırmızı kart, 21 = ikinci sarıdan kırmızı (typeDictionaries.ts). */
export function countRedCards(events: Array<{ type_id: number }> | null | undefined): number {
  return (events ?? []).filter((e) => e.type_id === 20 || e.type_id === 21).length;
}
