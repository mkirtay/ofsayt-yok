/**
 * Maç detayının canlı güncellemesini (`/api/matches/[id]/live`) ana sayfa listesine taşımak için saf yardımcılar.
 *
 * Liste (`/api/matches/day`) ile detay farklı önbellek katmanlarından besleniyor; panel golü gösterirken liste
 * bir yenileme turu geride kalabiliyordu. Detay yeni veri getirince listedeki aynı maç buradan yamalanır.
 *
 * Tek yönlü (monoton) koruma — geride kalan veri yeniyi ezmez:
 * - Evre geri gidemez: başlamadı → canlı / devre arası → bitti (bitmiş maç canlıya dönmez).
 * - Toplam gol geri gidemez (VAR iptali gibi gerçek düşüşleri listenin kendi yenilemesi düzeltir).
 * - Aynı evre ve gol sayısında dakika geri gidemez (dakikası okunamayan taraf, ör. devre arası, engellemez).
 */
import type { Match, MatchScore } from '@/models/liveScore';
import type { LiveMatchPatch } from '@/server/liveMatch';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { parseScore } from '@/utils/parseScore';

/** Ana sayfa listesi önbelleğinin yamalanan dizileri (bkz. hooks/useHomeHubMatches.ts). */
export type HomeMatchLists = {
  allMatches: Match[];
  liveMatches: Match[];
  fixtureMatches: Match[];
  nightMatches: Match[];
};

const LIST_KEYS = ['allMatches', 'liveMatches', 'fixtureMatches', 'nightMatches'] as const;

type Progress = Pick<Match, 'status' | 'time' | 'scores' | 'score'>;

function phaseRank(status: string | undefined): number {
  const phase = deriveMatchPhase(status);
  return phase === 'PRE' ? 0 : phase === 'POST' ? 2 : 1;
}

function totalGoals(m: Progress): number | null {
  const pair = parseScore(m.scores?.score ?? m.score);
  return pair ? pair[0] + pair[1] : null;
}

/** "74'" → 74, "45+2'" → 45.02; okunamazsa null. */
export function parseMatchMinute(time: string | null | undefined): number | null {
  const m = /^\s*(\d+)(?:\s*\+\s*(\d+))?/.exec(time ?? '');
  return m ? Number(m[1]) + (m[2] ? Number(m[2]) / 100 : 0) : null;
}

/** Gelen canlı veri listedekinin gerisinde mi (evre, toplam gol, dakika sırasıyla). */
export function isLivePatchBehind(current: Progress, patch: Progress): boolean {
  const rankDiff = phaseRank(patch.status) - phaseRank(current.status);
  if (rankDiff !== 0) return rankDiff < 0;
  const before = totalGoals(current);
  const after = totalGoals(patch);
  if (before != null && after != null && after !== before) return after < before;
  const minuteBefore = parseMatchMinute(current.time);
  const minuteAfter = parseMatchMinute(patch.time);
  return minuteBefore != null && minuteAfter != null && minuteAfter < minuteBefore;
}

function sameScores(a: MatchScore | undefined, b: MatchScore | undefined): boolean {
  if (!b) return true; // yamada skor yoksa listedeki korunur
  if (!a) return false;
  return (
    a.score === b.score &&
    a.ht_score === b.ht_score &&
    a.ft_score === b.ft_score &&
    a.et_score === b.et_score &&
    a.ps_score === b.ps_score
  );
}

/**
 * Listedeki maça canlı yamayı uygular. Yalnız skor ya da durum (status / özel durum / uzatma-penaltı bitişi)
 * değiştiyse yeni nesne döner; yalnız dakika ilerlediyse ya da yama gerideyse AYNI nesne döner. Dakika tek başına
 * yamalanmaz: react-query her önbellek değişiminde listenin 30 sn'lik yenileme sayacını baştan başlatıyor, dakikada bir
 * yama listenin kendi yenilemesini sürekli erteler.
 */
export function applyLivePatchToMatch(current: Match, patch: LiveMatchPatch): Match {
  if (String(current.id) !== String(patch.id)) return current;
  if (isLivePatchBehind(current, patch)) return current;
  const changed =
    current.status !== patch.status ||
    current.state_code !== patch.state_code ||
    current.finish !== patch.finish ||
    !sameScores(current.scores, patch.scores);
  if (!changed) return current;
  const next: Match = { ...current, status: patch.status, time: patch.time };
  if (patch.state_code) next.state_code = patch.state_code;
  else delete next.state_code;
  if (patch.finish) next.finish = patch.finish;
  else delete next.finish;
  if (patch.scores) next.scores = patch.scores;
  return next;
}

/** Listenin bütün dizilerinde aynı maçı yamalar; değişiklik yoksa AYNI nesne (react-query gereksiz bildirim yapmasın). */
export function applyLivePatchToLists<T extends HomeMatchLists>(data: T, patch: LiveMatchPatch): T {
  let next: T | null = null;
  for (const key of LIST_KEYS) {
    const list = data[key];
    let patched: Match[] | null = null;
    list.forEach((m, i) => {
      const p = applyLivePatchToMatch(m, patch);
      if (p === m) return;
      patched ??= [...list];
      patched[i] = p;
    });
    if (patched) {
      next ??= { ...data };
      next[key] = patched;
    }
  }
  return next ?? data;
}
