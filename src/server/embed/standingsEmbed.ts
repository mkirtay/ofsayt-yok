/**
 * Gömülebilir puan durumu (SEO raporu 2026-11-16: taraftar / yerel haber siteleri için, altında Scor3 bağlantısı).
 * Bağımsız küçük HTML (site düzeni, JS, çerez yok). Veri lig sayfasıyla aynı önbellekli puan durumu isteği.
 */
import type { CompetitionTableStandingRow } from '@/services/liveScoreService';
import { escapeXml as esc } from '@/server/sitemap/sections';
import { teamHref } from '@/utils/teamUrl';

export type EmbedTheme = 'light' | 'dark';

export function buildStandingsEmbedHtml(opts: {
  leagueName: string;
  hubUrl: string;
  baseUrl: string;
  rows: CompetitionTableStandingRow[];
  theme: EmbedTheme;
  brand: string;
}): string {
  const dark = opts.theme === 'dark';
  const c = dark
    ? { bg: '#0f141a', fg: '#e8edf2', sub: '#9aa4af', line: '#222b35', head: '#151c24' }
    : { bg: '#ffffff', fg: '#111827', sub: '#6b7280', line: '#e5e7eb', head: '#f3f4f6' };
  const rows = opts.rows
    .map((r) => {
      const name = r.team?.name || r.name || '';
      const id = r.team?.id ?? r.team_id;
      const team = id ? `<a href="${esc(`${opts.baseUrl}${teamHref(id, name)}`)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
      return `<tr><td class="n">${r.rank}</td><td class="t">${team}</td><td>${r.matches}</td><td>${r.won}</td><td>${r.drawn}</td><td>${r.lost}</td><td>${r.goal_diff > 0 ? '+' : ''}${r.goal_diff}</td><td class="p">${r.points}</td></tr>`;
    })
    .join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(opts.leagueName)} puan durumu — ${esc(opts.brand)}</title><style>
*{box-sizing:border-box}body{margin:0;background:${c.bg};color:${c.fg};font:13px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
h1{font-size:14px;margin:0;padding:10px 12px;background:${c.head};border-bottom:1px solid ${c.line}}
table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;text-align:center;border-bottom:1px solid ${c.line};white-space:nowrap}
th{font-size:11px;color:${c.sub};font-weight:600}td.t,th.t{text-align:left;white-space:normal}td.n{color:${c.sub}}td.p{font-weight:700}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}
footer{padding:8px 12px;font-size:12px;color:${c.sub}}footer a{color:${dark ? '#7ee2a8' : '#047857'};font-weight:600}
</style></head><body><h1>${esc(opts.leagueName)} puan durumu</h1><table><thead><tr><th>#</th><th class="t">Takım</th><th>O</th><th>G</th><th>B</th><th>M</th><th>AV</th><th>P</th></tr></thead><tbody>${rows}</tbody></table><footer>Puan durumu: <a href="${esc(opts.hubUrl)}" target="_blank" rel="noopener">${esc(opts.brand)} — ${esc(opts.leagueName)}</a></footer></body></html>`;
}
