/**
 * Maç öncesi (PREVIEW) Gündem taslağı — SAF: kayıtlı `MatchAnalysis` (PRE) → kısa post. LLM çağrısı YOK; analiz yoksa
 * post da yok (OpenAI bütçesi yenmez). Metin yalnızca analizin ÜCRETSİZ önizlemesinden (`buildAnalysisPreview`: tempo +
 * baskın taraf cümlesi, ana olasılık) kurulur → kredi duvarının arkasındaki hiçbir alan bota sızmaz.
 * Seçim kuralı: Süper Lig'de dört büyükten biri · Avrupa kupalarında Türk takımı · 5 büyük ligde derbi.
 */
import { POST_MAX_LENGTH } from '@/config/gundem';
import { buildAnalysisPreview, type AnalysisPreview } from '@/utils/analysisPreview';
import { BIG_FIVE, SUPER_LIG, TURKEY_COUNTRY_ID, UEFA_CLUB_LEAGUES } from '@/server/analysisPregen';
import { leagueDisplayName } from './leagueNames';
import { closingQuestion } from './closingQuestion';

/** Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor (Sportmonks takım id; bkz. config/teamShortNames.ts). */
export const BIG_FOUR_TEAM_IDS: readonly number[] = [34, 88, 554, 688];
/** Başlamasına 1–2 saat kalan maçlar (15 dk'lık tick'te her maç ~4 kez görülür; `externalKey` tek post sağlar). */
export const PREVIEW_WINDOW_MIN_MS = 60 * 60_000;
export const PREVIEW_WINDOW_MAX_MS = 120 * 60_000;

export type PreviewReason = 'super-lig-big4' | 'uefa-turkish' | 'big5-derby';

export type PreviewFixture = {
  id: number;
  league_id?: number;
  state_id?: number;
  name?: string;
  starting_at?: string | null;
  starting_at_timestamp?: number | null;
  participants?: Array<{ id: number; name?: string; country_id?: number | null; meta?: { location?: string } }>;
  /** Yalnızca maç sonu (RECAP) çağrısında: `include=scores`. */
  scores?: Array<{ description: string; score: { goals: number; participant: 'home' | 'away' } }>;
};

export type PreviewCandidate = {
  fixture: PreviewFixture;
  kickoffMs: number;
  homeId: number;
  awayId: number;
  /** `big5-derby`: derbi olduğu (Sportmonks rakip listeleri) ayrıca doğrulanmalı. */
  reason: PreviewReason;
};

export function fixtureKickoffMs(f: PreviewFixture): number | null {
  if (typeof f.starting_at_timestamp === 'number') return f.starting_at_timestamp * 1000;
  const t = f.starting_at ? Date.parse(`${f.starting_at.replace(' ', 'T')}Z`) : NaN;
  return Number.isFinite(t) ? t : null;
}

export function homeAway(f: PreviewFixture) {
  const ps = f.participants ?? [];
  const home = ps.find((p) => p.meta?.location === 'home');
  const away = ps.find((p) => p.meta?.location === 'away');
  return home && away ? { home, away } : null;
}

/** Büyük maç tanımı (zaman penceresi hariç). `null` → kapsam dışı. */
export function previewReason(f: PreviewFixture): PreviewReason | null {
  const ha = homeAway(f);
  if (!ha) return null;
  const league = Number(f.league_id);
  if (league === SUPER_LIG) return BIG_FOUR_TEAM_IDS.includes(ha.home.id) || BIG_FOUR_TEAM_IDS.includes(ha.away.id) ? 'super-lig-big4' : null;
  if ((UEFA_CLUB_LEAGUES as readonly number[]).includes(league)) {
    return ha.home.country_id === TURKEY_COUNTRY_ID || ha.away.country_id === TURKEY_COUNTRY_ID ? 'uefa-turkish' : null;
  }
  if ((BIG_FIVE as readonly number[]).includes(league)) return 'big5-derby';
  return null;
}

export function selectPreviewCandidates(fixtures: PreviewFixture[], now: number): PreviewCandidate[] {
  const out: PreviewCandidate[] = [];
  for (const f of fixtures) {
    const ko = fixtureKickoffMs(f);
    if (ko == null || ko - now < PREVIEW_WINDOW_MIN_MS || ko - now > PREVIEW_WINDOW_MAX_MS) continue;
    if (f.state_id != null && f.state_id !== 1) continue; // 1 = NS; ertelenen/iptal edilen yok
    const reason = previewReason(f);
    const ha = homeAway(f);
    if (!reason || !ha) continue;
    out.push({ fixture: f, kickoffMs: ko, homeId: ha.home.id, awayId: ha.away.id, reason });
  }
  return out.sort((a, b) => a.kickoffMs - b.kickoffMs);
}

export const previewKey = (fixtureId: number) => `preview:${fixtureId}`;

export type PreviewFacts = {
  kind: 'PREVIEW';
  fixtureId: number;
  reason: PreviewReason;
  kickoffAt: string;
  homeName: string;
  awayName: string;
  leagueName: string | null;
  analysisId: string;
  modelVersion: string | null;
  top: AnalysisPreview['top'];
};

export type PreviewAnalysisRow = {
  id: string;
  homeTeamName: string;
  awayTeamName: string;
  modelVersion?: string | null;
  matchPrediction: unknown;
  fullReport?: unknown;
};

const trTime = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });

function outcomeText(top: NonNullable<AnalysisPreview['top']>, home: string, away: string): string {
  if (top.outcome === 'DRAW') return `Analiz görüşü: Beraberlik %${top.pct}`;
  return `Analiz görüşü: ${top.outcome === 'HOME' ? home : away} kazanır %${top.pct}`;
}

export type PreviewDraft = { externalKey: string; body: string; facts: PreviewFacts; warnings: string[] };

/** Özet yoksa (analiz önizleme üretemiyorsa) `null` — içeriksiz "maç var" postu yazılmaz. */
export function buildPreviewDraft(c: PreviewCandidate, analysis: PreviewAnalysisRow): PreviewDraft | null {
  const ha = homeAway(c.fixture);
  if (!ha) return null;
  const preview = buildAnalysisPreview(analysis);
  if (preview.summary.length === 0 && !preview.top) return null;
  const home = ha.home.name ?? analysis.homeTeamName;
  const away = ha.away.name ?? analysis.awayTeamName;
  const leagueName = leagueDisplayName(c.fixture.league_id, null);
  const head = `${home} – ${away}${leagueName ? ` (${leagueName})` : ''}, saat ${trTime.format(c.kickoffMs)}.`;
  const prediction = preview.top ? outcomeText(preview.top, home, away) : null;

  // Uzunluk: önce ikinci özet cümlesi, sonra olasılık satırı, sonra ilk özet cümlesi feda edilir; soru en son düşer.
  const question = closingQuestion('PREVIEW', c.fixture.id);
  const bases = [
    [head, preview.summary.join(' '), prediction],
    [head, preview.summary[0], prediction],
    [head, preview.summary[0]],
    [head, prediction],
  ].map((parts) => parts.filter(Boolean).join('\n'));
  const variants = [...bases.map((b) => `${b}\n\n${question}`), ...bases];
  const body = variants.find((v) => v.length <= POST_MAX_LENGTH);
  if (!body) return null;

  return {
    externalKey: previewKey(c.fixture.id),
    body,
    warnings: [],
    facts: {
      kind: 'PREVIEW',
      fixtureId: c.fixture.id,
      reason: c.reason,
      kickoffAt: new Date(c.kickoffMs).toISOString(),
      homeName: home,
      awayName: away,
      leagueName,
      analysisId: analysis.id,
      modelVersion: analysis.modelVersion ?? null,
      top: preview.top,
    },
  };
}
