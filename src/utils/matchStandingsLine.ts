/**
 * Maç sayfası "puan durumu" satırı (SEO 2026-11-22: "A - B puan durumu" aramaları; başlık/açıklamadaki puan durumu vaadini
 * sayfa metninde karşılar). Saf işlev: tablo satırlarından iki takımın güncel sırası. Veri sunucuda yalnız önbellekten
 * gelir (bkz. server/matchStandingsLine.ts).
 */
import type { CompetitionTableStandingRow } from '@/services/liveScoreService';

export type StandingsSide = { name: string; rank: number; points: number; played: number };
export type MatchStandingsLine = { leagueName: string; leagueHref: string | null; home: StandingsSide | null; away: StandingsSide | null };

function side(rows: CompetitionTableStandingRow[], teamId: number, name: string): StandingsSide | null {
  const r = rows.find((x) => Number(x.team?.id ?? x.team_id) === teamId);
  return r ? { name, rank: r.rank, points: r.points, played: r.matches } : null;
}

/** Aynı tablodaki (grup) iki takım; ikisi de bulunamazsa null. Gruplu turnuvada önce ikisini birlikte içeren grup. */
export function pickStandings(
  blocks: { rows: CompetitionTableStandingRow[] }[],
  home: { id: number; name: string },
  away: { id: number; name: string },
): { home: StandingsSide | null; away: StandingsSide | null } | null {
  let best: { home: StandingsSide | null; away: StandingsSide | null } | null = null;
  for (const b of blocks) {
    const h = side(b.rows, home.id, home.name);
    const a = side(b.rows, away.id, away.name);
    if (h && a) return { home: h, away: a };
    if (!best && (h || a)) best = { home: h, away: a };
  }
  return best;
}

const fmt = (s: StandingsSide) => `${s.name} ${s.rank}. sırada (${s.points} puan, ${s.played} maç)`;

export function standingsSentence(line: MatchStandingsLine): string | null {
  const parts = [line.home, line.away].filter((s): s is StandingsSide => s != null).sort((a, b) => a.rank - b.rank);
  if (!parts.length) return null;
  return `Güncel ${line.leagueName} puan durumunda ${parts.map(fmt).join(', ')}.`;
}
