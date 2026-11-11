/**
 * Günlük oran toplama (backtest için): yaklaşan 1–2 günün AI analizi olan maçlarının (ve milli maçların) oranını
 * `ComboOddsSnapshot` tablosuna yazar. Maç + pazar başına TEK satır: ilk görülen oran (`first*`) ve her çalışmada güncellenen son
 * oran (`last*`) → idempotent, tablo şişmez. Tablo YOKSA (migration henüz uygulanmadı) sessizce atlanır — prod'a hiçbir şey gitmez.
 * Oran çekimi kombine bütçe havuzundan, `resolveOdds` ile (eşzamanlılık 4, önbellekli).
 */
import { prisma } from '@/lib/prisma';
import { loadComboCandidates } from '@/server/combo/candidates';
import { resolveOdds, loadAfOdds, type OddsResult } from '@/server/combo/afOdds';
import { loadNationalDay } from '@/server/apiFootball/nationalDay';
import { nationalMatchesEnabled } from '@/config/nationalMatches';
import { toAfId } from '@/services/apiFootball/ids';
import { marketOdd } from '@/services/apiFootball/oddsMarkets';
import { matchKickoffMs } from '@/utils/matchActivity';
import { shiftIsoDate, todayIsoIstanbul } from '@/utils/dateStrip';
import type { TopPickKey } from '@/utils/analysisTopPicks';

export type SnapshotRow = {
  matchId: string;
  pickKey: TopPickKey;
  afFixtureId: number;
  day: string;
  kickoffAt: Date;
  /** Modelin olasılığı (%); milli maçta (AI analizi yok) null. */
  pct: number | null;
  bookmaker: string;
  odd: number;
  median: number;
};

export type Exec = (text: string, values: unknown[]) => Promise<unknown>;

export const UPSERT_SQL = `
INSERT INTO "ComboOddsSnapshot"
  ("id","matchId","pickKey","afFixtureId","day","kickoffAt","pct","bookmaker","firstOdd","firstMedian","lastOdd","lastMedian")
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$10)
ON CONFLICT ("matchId","pickKey") DO UPDATE SET
  "lastOdd" = EXCLUDED."lastOdd",
  "lastMedian" = EXCLUDED."lastMedian",
  "lastAt" = CURRENT_TIMESTAMP,
  "bookmaker" = EXCLUDED."bookmaker",
  "pct" = COALESCE(EXCLUDED."pct", "ComboOddsSnapshot"."pct"),
  "snapshots" = "ComboOddsSnapshot"."snapshots" + 1
WHERE "ComboOddsSnapshot"."kickoffAt" > CURRENT_TIMESTAMP`;

/** Kombine tablosu yok (Postgres 42P01 / Prisma P2010 "does not exist") mu? */
export function isMissingTable(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { code?: string } } | null;
  if (!e) return false;
  return e.code === '42P01' || e.meta?.code === '42P01' || /Combo\w+.*does not exist/i.test(e.message ?? '');
}

let idSeq = 0;
const newId = () => `cos_${Date.now().toString(36)}_${(idSeq++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function saveSnapshots(exec: Exec, rows: readonly SnapshotRow[]): Promise<{ written: number; skipped?: 'no-table' }> {
  let written = 0;
  for (const r of rows) {
    try {
      await exec(UPSERT_SQL, [newId(), r.matchId, r.pickKey, r.afFixtureId, r.day, r.kickoffAt, r.pct, r.bookmaker, r.odd, r.median]);
      written += 1;
    } catch (error) {
      if (isMissingTable(error)) return { written, skipped: 'no-table' };
      throw error;
    }
  }
  return { written };
}

const prismaExec: Exec = (text, values) => prisma.$executeRawUnsafe(text, ...values);

const istanbulDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);

/** Kayda geçecek milli maç pazarları (AI analizi yok → olasılık yok; piyasa kalibrasyonu için). */
const NATIONAL_KEYS: readonly TopPickKey[] = ['home', 'draw', 'away', 'over25', 'btts'];

export type SnapshotRunDeps = {
  now?: number;
  exec?: Exec;
  candidates?: typeof loadComboCandidates;
  odds?: typeof resolveOdds;
  nationalDay?: typeof loadNationalDay;
  afOdds?: typeof loadAfOdds;
  nationalEnabled?: boolean;
};

export type SnapshotRunResult = { candidates: number; withOdds: number; national: number; written: number; skipped?: 'no-table' };

export async function runComboOddsSnapshot(deps: SnapshotRunDeps = {}): Promise<SnapshotRunResult> {
  const now = deps.now ?? Date.now();
  const exec = deps.exec ?? prismaExec;
  const today = todayIsoIstanbul(new Date(now));
  const days = [today, shiftIsoDate(today, 1)];
  const rows: SnapshotRow[] = [];

  // 1) AI analizi olan yaklaşan maçlar → önerilen en güçlü pazarın oranı.
  const lists = await Promise.all(days.map((d) => (deps.candidates ?? loadComboCandidates)(d, { now })));
  const candidates = lists.flat();
  const results = candidates.length
    ? await (deps.odds ?? resolveOdds)(
        candidates.map((c) => ({ matchId: c.matchId, key: c.key, kickoffMs: c.kickoffIso ? Date.parse(c.kickoffIso) : null, home: c.homeName, away: c.awayName })),
      )
    : [];
  const byId = new Map<string, OddsResult>(results.map((r) => [r.matchId, r]));
  let withOdds = 0;
  for (const c of candidates) {
    const r = byId.get(c.matchId);
    if (!r || r.status !== 'ok' || !c.kickoffIso) continue;
    withOdds += 1;
    rows.push({ matchId: c.matchId, pickKey: c.key, afFixtureId: r.afFixtureId, day: istanbulDay(Date.parse(c.kickoffIso)), kickoffAt: new Date(c.kickoffIso), pct: c.pct, bookmaker: r.market.bookmaker, odd: r.market.odd, median: r.market.median });
  }

  // 2) Milli maçlar (bayrak açıksa): 1X2 + 2.5 üst + KG var, olasılıksız.
  let national = 0;
  if (deps.nationalEnabled ?? nationalMatchesEnabled()) {
    for (const d of days) {
      const day = await (deps.nationalDay ?? loadNationalDay)(d);
      if (!day.ok) continue;
      for (const m of day.matches) {
        const kick = matchKickoffMs(m);
        const afId = toAfId(m.id);
        if (kick == null || kick <= now || afId == null) continue;
        const o = await (deps.afOdds ?? loadAfOdds)(afId);
        if (!o.ok || !o.entry) continue;
        national += 1;
        for (const key of NATIONAL_KEYS) {
          const mk = marketOdd(o.entry, key);
          if (mk) rows.push({ matchId: String(m.id), pickKey: key, afFixtureId: afId, day: istanbulDay(kick), kickoffAt: new Date(kick), pct: null, bookmaker: mk.bookmaker, odd: mk.odd, median: mk.median });
        }
      }
    }
  }

  const saved = await saveSnapshots(exec, rows);
  return { candidates: candidates.length, withOdds, national, ...saved };
}
