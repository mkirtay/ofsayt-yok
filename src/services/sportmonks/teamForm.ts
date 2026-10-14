/**
 * Takım formu isteği (`teams/{id}?include=` bu sabit; bkz. liveScoreService `sportmonksFetchTeamForm`) ve önbellek süresi.
 *
 * `latest` yalnız BİTMİŞ maçları taşır (2026-10-14 gerçek istekle: GS 34, Lyngby 2650). Eski `fixtures/between` formu
 * bugünün başlamamış / canlı maçını da içerdiği için maç bitince form birkaç dakikada tazeleniyordu; aynı davranış için
 * `upcoming` da istenir (yalnız başlama saati okunur; alan seçimi Sportmonks'ta yok sayılıyor, taban alanlar ~250 B/satır).
 */
export const TEAM_FORM_INCLUDE = 'latest.participants;latest.scores;latest.state;upcoming:starting_at,state_id';

const MIN = 60;
const HOUR = 60 * MIN;
/** Başlamış ama henüz `latest`'e geçmemiş maç (canlı / uzatma / bitişi işlenmemiş) bu kadar süre "sürüyor" sayılır. */
const IN_PROGRESS_WINDOW_SECONDS = 4 * HOUR;
/** Maç sürerken form değişmez; bitişi bu aralıkla yoklanır. */
const IN_PROGRESS_FRESH_SECONDS = 10 * MIN;
/** Başlamadan bu kadar sonra ilk "bitti mi" yoklaması (90 dk + devre arası + uzatma payı). */
const EXPECTED_FINISH_AFTER_SECONDS = 105 * MIN;
const MIN_FRESH_SECONDS = 30;
/** Son maç başlayalı bu kadar olmadıysa skor / sonuç düzeltmesi gelebilir → 1 sa; değilse 6 sa (eski `between` kuralı). */
const RECENT_MATCH_WINDOW_SECONDS = 5 * HOUR;

type Row = { starting_at?: string | null; starting_at_timestamp?: number | null };

function kickoffSeconds(f: Row): number | null {
  if (typeof f.starting_at_timestamp === 'number') return f.starting_at_timestamp;
  if (!f.starting_at) return null;
  const t = Date.parse(`${f.starting_at.replace(' ', 'T')}Z`);
  return Number.isFinite(t) ? t / 1000 : null;
}

function rows(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

/**
 * Taze süre (sn):
 * - temel (eski `between` takım formu kuralı): son bitmiş maç başlayalı < 5 sa → 1 sa, değilse 6 sa;
 * - başlamış ama `latest`'te olmayan maç (`upcoming`'de, başlayalı < 4 sa) → 10 dk;
 * - sıradaki maç varsa en geç onun beklenen bitişine (başlama + 105 dk) kadar.
 */
export function teamFormFreshSeconds(team: { latest?: unknown; upcoming?: unknown }, nowMs: number): number {
  const now = nowMs / 1000;
  const latest = rows(team.latest);
  const newest = Math.max(-Infinity, ...latest.map((f) => kickoffSeconds(f) ?? -Infinity));
  let fresh = Number.isFinite(newest) && now - newest < RECENT_MATCH_WINDOW_SECONDS ? HOUR : 6 * HOUR;
  for (const f of rows(team.upcoming)) {
    const k = kickoffSeconds(f);
    if (k == null) continue;
    if (k <= now) {
      if (now - k < IN_PROGRESS_WINDOW_SECONDS) return IN_PROGRESS_FRESH_SECONDS;
      continue;
    }
    fresh = Math.min(fresh, k + EXPECTED_FINISH_AFTER_SECONDS - now);
  }
  return Math.max(MIN_FRESH_SECONDS, Math.floor(fresh));
}
