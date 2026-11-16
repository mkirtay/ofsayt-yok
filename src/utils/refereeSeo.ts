/**
 * Hakem sayfası alıntılanabilir özeti (SEO/GEO raporu 2026-11-16): "X, 2026/2027 Süper Lig sezonunda 7 maç yönetti; maç
 * başı 5,57 sarı kart …". Yalnız sayfa verisinden (ek istek yok). Lig adı Türkçe kısa ad (eşlemesi yoksa ad yok).
 */
import type { RefereePageData } from '@/server/people/refereePage';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });
const n = (v: number) => nf.format(Math.round(v * 100) / 100);

export function buildRefereeSummary(data: Pick<RefereePageData, 'name' | 'summary' | 'teams'>): string[] {
  const out: string[] = [];
  const ctx = data.summary.context;
  if (ctx && ctx.matches > 0) {
    const league = leagueDisplayName(ctx.leagueId, null);
    const where = `${ctx.seasonName}${league ? ` ${league}` : ''} sezonunda`;
    const rates: string[] = [];
    if (ctx.rates.yellow != null) rates.push(`${n(ctx.rates.yellow)} sarı kart`);
    if (ctx.rates.red != null) rates.push(`${n(ctx.rates.red)} kırmızı kart`);
    if (ctx.rates.penalties != null) rates.push(`${n(ctx.rates.penalties)} penaltı`);
    let s = `${data.name}, ${where} ${ctx.matches} maç yönetti${rates.length ? `; maç başına ${rates.join(', ')} verdi` : ''}.`;
    const avg = ctx.leagueAvg?.yellow;
    if (avg != null && ctx.rates.yellow != null) {
      const diff = ctx.rates.yellow - avg;
      const cmp = Math.abs(diff) < 0.25 ? 'lig ortalamasına yakın' : diff > 0 ? 'lig ortalamasının üzerinde' : 'lig ortalamasının altında';
      s += ` Sarı kart ortalaması ${cmp} (lig hakemleri: ${n(avg)}).`;
    }
    out.push(s);
  }
  if (data.summary.totalMatches > 0) {
    out.push(`Kayıtlarımızda ${data.summary.seasonCount} sezonda toplam ${data.summary.totalMatches} maçı var.`);
  }
  const season = data.teams.seasons.find((x) => x.seasonName === data.teams.defaultSeason) ?? data.teams.seasons[0];
  const top = season ? [...season.rows].sort((a, b) => b.matches - a.matches || b.yellow - a.yellow)[0] : undefined;
  if (season && top && top.matches > 1) {
    out.push(`${season.seasonName} sezonunda en çok ${top.name} maçlarını yönetti (${top.matches} maç, bu takıma ${top.yellow} sarı kart).`);
  }
  return out;
}

type TableRow = { name: string; matches: number; yellowPerMatch: number | null; penaltiesPerMatch: number | null };

/**
 * /hakemler alıntılanabilir özeti: "2026/2027 Süper Lig sezonunda maç başına en çok sarı kart gösteren hakem X (5,57; 7 maç)."
 * En az `minMatches` maç yöneten hakemler arasından (tek maçlık uç değer lider olmasın).
 */
export function buildRefereeTableSummary(league: string, season: string, rows: TableRow[], minMatches = 3): string[] {
  const eligible = rows.filter((r) => r.matches >= minMatches);
  const out: string[] = [];
  const topBy = (get: (r: TableRow) => number | null) =>
    [...eligible].filter((r) => get(r) != null).sort((a, b) => get(b)! - get(a)! || b.matches - a.matches)[0];
  const y = topBy((r) => r.yellowPerMatch);
  if (y) out.push(`${season} ${league} sezonunda maç başına en çok sarı kart gösteren hakem ${y.name} (${n(y.yellowPerMatch!)}; ${y.matches} maç).`);
  const p = topBy((r) => r.penaltiesPerMatch);
  if (p && p.penaltiesPerMatch! > 0) out.push(`Maç başına en çok penaltı veren hakem ${p.name} (${n(p.penaltiesPerMatch!)}).`);
  const busiest = [...rows].sort((a, b) => b.matches - a.matches)[0];
  if (busiest && busiest.matches > 0) out.push(`En çok maç yöneten hakem ${busiest.name} (${busiest.matches} maç).`);
  return out;
}
