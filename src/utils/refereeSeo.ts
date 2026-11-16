/**
 * Hakem sayfası alıntılanabilir özeti (SEO/GEO raporu 2026-11-16): "X, 2026/2027 Süper Lig sezonunda 7 maç yönetti; maç
 * başı 5,57 sarı kart …". Yalnız sayfa verisinden (ek istek yok). Lig adı Türkçe kısa ad (eşlemesi yoksa ad yok).
 * Hakem sayfalarının kuralı: yalnız sayı, YORUM / VURGU / SIRALAMA YOK ("en çok", "üzerinde" gibi) — bkz. PersonPage testleri.
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
    if (avg != null) s += ` Aynı lig ve sezonda hakemlerin ortalaması maç başına ${n(avg)} sarı kart.`;
    out.push(s);
  }
  if (data.summary.totalMatches > 0) {
    out.push(`Kayıtlarımızda ${data.summary.seasonCount} sezonda toplam ${data.summary.totalMatches} maçı var.`);
  }
  const season = data.teams.seasons.find((x) => x.seasonName === data.teams.defaultSeason) ?? data.teams.seasons[0];
  if (season && season.rows.length) out.push(`${season.seasonName} sezonunda ${season.rows.length} farklı takımın maçında görev aldı.`);
  return out;
}

type TableRow = { matches: number; yellowPerMatch: number | null; redPerMatch?: number | null; penaltiesPerMatch: number | null };

/**
 * /hakemler alıntılanabilir özeti — sıralama / vurgu yok (hakem sayfası kuralı): kaç hakem, kaç maç, maç başına ortalamalar
 * (maç sayısıyla ağırlıklı).
 */
export function buildRefereeTableSummary(league: string, season: string, rows: TableRow[]): string[] {
  const played = rows.filter((r) => r.matches > 0);
  if (!played.length) return [];
  const total = played.reduce((a, r) => a + r.matches, 0);
  const avg = (get: (r: TableRow) => number | null | undefined) => {
    const xs = played.filter((r) => get(r) != null);
    const m = xs.reduce((a, r) => a + r.matches, 0);
    return m > 0 ? xs.reduce((a, r) => a + get(r)! * r.matches, 0) / m : null;
  };
  const y = avg((r) => r.yellowPerMatch);
  const p = avg((r) => r.penaltiesPerMatch);
  const rates = [y != null ? `${n(y)} sarı kart` : null, p != null ? `${n(p)} penaltı` : null].filter(Boolean);
  return [
    `${season} ${league} sezonunda ${played.length} hakem toplam ${total} maçta orta hakem olarak görev aldı${rates.length ? `; maç başına ortalama ${rates.join(' ve ')}` : ''}.`,
    'Tabloda her hakemin maç başı sarı kart, kırmızı kart, penaltı, faul ve VAR ortalamaları yer alır.',
  ];
}
