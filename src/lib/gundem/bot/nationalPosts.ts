/**
 * Milli maç (API-Football) Gündem taslakları — SAF. Kapsam: Türkiye A milli takımının maçı + aynı turnuvada Türkiye'nin
 * GRUBUNDAKİ diğer maçlar (puan durumundaki grup; hazırlık maçlarında grup yok → yalnız Türkiye maçı). Kulüp botundan
 * (previewPost/recapPost, Sportmonks) bağımsız; aynı `preview:` / `recap:` anahtarları (milli id'ler 2e9+ → çakışmaz).
 *
 * Maç önü: kayıtlı PRE analizi varsa onun ücretsiz önizlemesi (kulüp botuyla aynı kural); yoksa grup durumundan düz şablon.
 * Maç sonu: bitmiş her kapsam maçı (koşul aranmaz; milli maç az ve ilgi yüksek). Uydurma yok: veri yoksa cümle yazılmaz.
 */
import { POST_MAX_LENGTH } from '@/config/gundem';
import type { Match } from '@/models/liveScore';
import { buildAnalysisPreview } from '@/utils/analysisPreview';
import { FOCUS_NATIONAL_TEAM_ID } from '@/utils/nationalHomeStandings';
import { closingQuestion, withQuestion } from './closingQuestion';
import { PREVIEW_WINDOW_MAX_MS, PREVIEW_WINDOW_MIN_MS, previewKey, type PreviewAnalysisRow } from './previewPost';
import { RECAP_MAX_AGE_MS, recapKey } from './recapPost';

/** Grup satırı: takım id (uygulama id'si), sıra, puan. */
export type GroupRow = { teamId: number; name: string; rank: number; points: number; played: number };

export const isTurkiyeMatch = (m: Match) => Number(m.home?.id) === FOCUS_NATIONAL_TEAM_ID || Number(m.away?.id) === FOCUS_NATIONAL_TEAM_ID;

export function matchKickoffMs(m: Match): number | null {
  if (!m.date || !m.scheduled) return null;
  const t = Date.parse(`${m.date}T${m.scheduled}:00Z`);
  return Number.isFinite(t) ? t : null;
}

/**
 * Kapsamdaki maçlar: Türkiye maçları ve Türkiye'nin grubundaki (aynı turnuva) maçlar. `groups`: turnuva id → Türkiye'nin
 * grubundaki satırlar (grup bulunamadıysa turnuva haritada yok → yalnız Türkiye maçı).
 */
export function selectNationalScope(matches: readonly Match[], groups: ReadonlyMap<number, readonly GroupRow[]>): Match[] {
  return matches.filter((m) => {
    if (isTurkiyeMatch(m)) return true;
    const rows = groups.get(Number(m.competition?.id));
    if (!rows) return false;
    const ids = new Set(rows.map((r) => r.teamId));
    return ids.has(Number(m.home?.id)) && ids.has(Number(m.away?.id));
  });
}

/** Türkiye'nin oynadığı (grup tablosu olabilecek) turnuvalar — puan durumu yalnız bunlar için okunur. */
export function turkiyeCompetitionIds(matches: readonly Match[]): number[] {
  return [...new Set(matches.filter(isTurkiyeMatch).map((m) => Number(m.competition?.id)).filter((id) => Number.isFinite(id) && id > 0))];
}

const trTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });

function headLine(m: Match, prefix = ''): string {
  const comp = m.competition?.name ? ` (${m.competition.name})` : '';
  return `${prefix}${m.home.name} – ${m.away.name}${comp}`;
}

function groupLine(m: Match, rows: readonly GroupRow[] | undefined): string | null {
  if (!rows || rows.length === 0) return null;
  const h = rows.find((r) => r.teamId === Number(m.home.id));
  const a = rows.find((r) => r.teamId === Number(m.away.id));
  if (!h || !a || h.played + a.played === 0) return null;
  return `Grupta ${h.name} ${h.rank}. (${h.points} puan), ${a.name} ${a.rank}. (${a.points} puan).`;
}

export type NationalDraft = { externalKey: string; kind: 'PREVIEW' | 'RECAP'; fixtureId: number; body: string; facts: Record<string, unknown>; warnings: string[] };

/** Maç önü penceresinde (başlamasına 1–2 sa) ve başlamamış maçlar. */
export function selectNationalPreview(scope: readonly Match[], now: number): Match[] {
  return scope.filter((m) => {
    const ko = matchKickoffMs(m);
    return m.status === 'NOT STARTED' && !m.state_code && ko != null && ko - now >= PREVIEW_WINDOW_MIN_MS && ko - now <= PREVIEW_WINDOW_MAX_MS;
  });
}

/** Bitmiş (normal sonuç; iptal/hükmen hariç), başlamasından en çok 12 sa geçmiş, skoru olan maçlar. */
export function selectNationalRecap(scope: readonly Match[], now: number): Match[] {
  return scope.filter((m) => {
    const ko = matchKickoffMs(m);
    return m.status === 'FINISHED' && !m.state_code && !!m.scores?.score && ko != null && ko <= now && now - ko <= RECAP_MAX_AGE_MS;
  });
}

export function buildNationalPreview(m: Match, rows: readonly GroupRow[] | undefined, analysis: PreviewAnalysisRow | null): NationalDraft | null {
  const ko = matchKickoffMs(m);
  if (ko == null) return null;
  const head = `${headLine(m)}, saat ${trTime.format(ko)}.`;
  const preview = analysis ? buildAnalysisPreview(analysis) : null;
  const top = preview?.top ?? null;
  const prediction = top ? (top.outcome === 'DRAW' ? `Analiz görüşü: Beraberlik %${top.pct}` : `Analiz görüşü: ${top.outcome === 'HOME' ? m.home.name : m.away.name} kazanır %${top.pct}`) : null;
  const group = groupLine(m, rows);
  const summary = preview?.summary[0] ?? null;
  const variants = [
    [head, summary, prediction, group],
    [head, summary, prediction],
    [head, prediction, group],
    [head, group],
    [head],
  ].map((p) => p.filter(Boolean).join('\n'));
  const plain = variants.find((v) => v.length <= POST_MAX_LENGTH);
  if (!plain) return null;
  const body = withQuestion(plain, closingQuestion('PREVIEW', m.id), POST_MAX_LENGTH);
  return {
    externalKey: previewKey(m.id),
    kind: 'PREVIEW',
    fixtureId: m.id,
    body,
    warnings: analysis ? [] : ['no-analysis: grup şablonu'],
    facts: { kind: 'PREVIEW', source: 'national', fixtureId: m.id, kickoffAt: new Date(ko).toISOString(), homeName: m.home.name, awayName: m.away.name, leagueName: m.competition?.name ?? null, analysisId: analysis?.id ?? null, top },
  };
}

function parseScore(s: string | undefined): { home: number; away: number } | null {
  const mm = /^(\d+)-(\d+)$/.exec(s ?? '');
  return mm ? { home: Number(mm[1]), away: Number(mm[2]) } : null;
}

export function buildNationalRecap(m: Match): NationalDraft | null {
  const score = parseScore(m.scores?.ft_score ?? m.scores?.score);
  const ko = matchKickoffMs(m);
  if (!score || ko == null) return null;
  const comp = m.competition?.name ? ` (${m.competition.name})` : '';
  const head = `Maç sonu: ${m.home.name} ${score.home}-${score.away} ${m.away.name}${comp}`;
  const lines: string[] = [];
  if (isTurkiyeMatch(m)) {
    const trHome = Number(m.home.id) === FOCUS_NATIONAL_TEAM_ID;
    const tr = trHome ? score.home : score.away;
    const opp = trHome ? score.away : score.home;
    lines.push(tr > opp ? 'Türkiye sahadan galibiyetle ayrıldı.' : tr === opp ? 'Türkiye bu maçtan 1 puanla ayrıldı.' : 'Türkiye bu maçı kaybetti.');
  }
  const pens = parseScore(m.scores?.ps_score);
  if (pens) lines.push(`Maç penaltılarla belli oldu (${pens.home}-${pens.away}).`);
  const reds = (m.red_cards?.home ?? 0) + (m.red_cards?.away ?? 0);
  if (reds > 0) lines.push(reds === 1 ? 'Maçta 1 kırmızı kart çıktı.' : `Maçta ${reds} kırmızı kart çıktı.`);
  const variants = [[head, ...lines.slice(0, 2)], [head, lines[0]], [head]].map((p) => p.filter(Boolean).join('\n'));
  const plain = variants.find((v) => v.length <= POST_MAX_LENGTH);
  if (!plain) return null;
  return {
    externalKey: recapKey(m.id),
    kind: 'RECAP',
    fixtureId: m.id,
    body: withQuestion(plain, closingQuestion('RECAP', m.id), POST_MAX_LENGTH),
    warnings: [],
    facts: { kind: 'RECAP', source: 'national', fixtureId: m.id, kickoffAt: new Date(ko).toISOString(), homeName: m.home.name, awayName: m.away.name, leagueName: m.competition?.name ?? null, score, redCards: reds },
  };
}
