/**
 * /lig/{slug}: sunucuda "kısa cevap" cümleleri (lider kim, kaç puan, gol kralı kim) — AI asistanların ve öne çıkan
 * snippet'lerin alıntılayacağı net bilgi. Saf fonksiyon; veri sayfanın zaten çektiği puan durumu + gol krallığından.
 */
import type { CompetitionTableStandingRow, TopScorerEntry } from '@/services/liveScoreService';

type Row = Pick<CompetitionTableStandingRow, 'rank' | 'points' | 'matches' | 'name'> & { team?: { name?: string } };

const rowName = (r: Row) => (r.team?.name || r.name || '').trim();

export function buildLeagueSummary(leagueName: string, rows: Row[] | null | undefined, scorers: TopScorerEntry[] | null | undefined): string[] {
  const out: string[] = [];
  const sorted = [...(rows ?? [])].filter((r) => rowName(r)).sort((a, b) => Number(a.rank) - Number(b.rank));
  const [first, second, third] = sorted;
  if (first && Number(first.points) >= 0) {
    const played = Number(first.matches);
    out.push(
      `${leagueName} puan durumunda${played > 0 ? ` ${played} maç sonunda` : ''} lider ${rowName(first)} (${Number(first.points)} puan).`,
    );
    const chasers = [second, third].filter(Boolean).map((r) => `${rowName(r!)} (${Number(r!.points)})`);
    if (chasers.length) out.push(`Takipçileri: ${chasers.join(', ')}.`);
  }
  const top = (scorers ?? []).find((s) => s.player?.name && s.goals > 0);
  if (top) {
    out.push(`Gol krallığında ${top.player!.name}${top.team?.name ? ` (${top.team.name})` : ''} ${top.goals} golle zirvede.`);
  }
  return out;
}
