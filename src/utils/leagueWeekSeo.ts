/** Lig hafta sayfası metinleri (SEO/GEO): tarih aralığı ve alıntılanabilir özet. Ek istek yok. */
import type { SeasonRound, WeekFixture } from '@/server/leagueWeeks';

const dayFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'long', year: 'numeric' });

function day(iso: string | null): string | null {
  return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? dayFmt.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : null;
}

export function weekDateRange(round: Pick<SeasonRound, 'start' | 'end'>): string {
  const a = day(round.start);
  const b = day(round.end);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a ?? b ?? '';
}

const PLAYED = new Set(['FT', 'AET', 'FT_PEN', 'AWARDED']);

export function buildWeekSummary(league: string, seasonName: string, round: SeasonRound, fixtures: WeekFixture[]): string[] {
  const out: string[] = [];
  const range = weekDateRange(round);
  const played = fixtures.filter((f) => f.state && PLAYED.has(f.state));
  const verb = round.finished ? 'oynandı' : 'oynanıyor';
  out.push(
    `${league} ${seasonName} sezonu ${round.week}. hafta${fixtures.length ? `nın ${fixtures.length} maçı` : ''}${range ? ` ${range} tarihlerinde` : ''} ${verb}${
      !round.finished && played.length ? `; ${played.length} maç tamamlandı` : ''
    }.`,
  );
  const goals = played.reduce((n, f) => n + (f.score ? f.score.split('-').reduce((s, x) => s + Number(x), 0) : 0), 0);
  if (played.length) out.push(`Tamamlanan ${played.length} maçta ${goals} gol atıldı (maç başına ${(goals / played.length).toLocaleString('tr-TR', { maximumFractionDigits: 2 })}).`);
  const refs = fixtures.filter((f) => f.referee);
  if (refs.length) {
    out.push(
      `Hakem atamaları: ${refs
        .slice(0, 10)
        .map((f) => `${f.referee!.name} (${f.home.name} - ${f.away.name})`)
        .join(', ')}.`,
    );
  }
  return out;
}
