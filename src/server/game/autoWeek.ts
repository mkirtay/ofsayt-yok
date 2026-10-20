/**
 * Haftalık listenin otomatik seçimi ve yayını (kullanıcı kararı 2026-10-20: admin her hafta onaylamaz). `game-settle` (10 dk)
 * her turda çağırır:
 *  - Bu haftanın (İstanbul, Pzt–Paz) satırı yoksa: haftanın başlamamış maçlarından öncelik + çeşitlilik kurallarıyla
 *    (config/gameMatchPriority.ts) en çok 10 maç seçilir ve hafta DOĞRUDAN YAYINLANIR. Hafta ortasında açılırsa yalnız
 *    kickoff'u gelecekte olan maçlar.
 *  - Satır varsa ve 10'dan az maç: boş yerler sonraki turlarda doldurulur (saatte en çok bir deneme — `autoCheckedAt`);
 *    listedeki maçlara (tahmin almış olsun olmasın) dokunulmaz, yalnız eklenir.
 *  - Admin listeyi elle değiştirdiyse (`lockedByAdmin`) ya da hafta kapandıysa hiçbir şey yapılmaz.
 * Kaynak: haftanın kalan UTC günlerinin önbellekli fikstür listeleri (ana sayfayla aynı anahtar; yeni istek türü yok) + yeni
 * seçilen maç başına snapshot (yoksa bir `fixtures/{id}`, Gündem ile ortak).
 */
import type { GameWeek, MatchSnapshot } from '@prisma/client';
import type { Match } from '@/models/liveScore';
import { WEEKLY_LIMITS } from '@/config/gameMatchPriority';
import { ensureMatchSnapshot } from '@/lib/gundem/matchSnapshot';
import { captureError } from '@/lib/logger';
import { attachWeekToPredictionsSql, ensureEntriesForWeekSql } from '@/lib/game/sql';
import { candidatesIn, selectMatches } from '@/lib/game/selection';
import { seasonOf, weekKeyOf, weekRange } from '@/lib/game/week';
import { prisma } from '@/lib/prisma';
import { getFixturesByDate } from '@/services/liveScoreService';
import { WEEK_MATCH_COUNT } from '@/server/game/weeks';

/** Boş yer varken yeniden deneme aralığı. */
export const AUTO_RETRY_MS = 3_600_000;

export type AutoWeekDeps = { now?: Date; fixturesForUtcDate?: (isoDate: string) => Promise<Match[]>; snapshot?: typeof ensureMatchSnapshot };

export type AutoWeekResult = { weekKey: string; created: boolean; added: number; skipped: 'locked' | 'settled' | 'full' | 'recent' | 'none' | null };

function utcDatesBetween(from: Date, to: Date): string[] {
  const out = new Set<string>();
  for (let t = from.getTime(); t < to.getTime(); t += 86_400_000) out.add(new Date(t).toISOString().slice(0, 10));
  out.add(new Date(to.getTime() - 1).toISOString().slice(0, 10));
  return [...out];
}

export async function ensureWeeklyRound(deps: AutoWeekDeps = {}): Promise<AutoWeekResult> {
  const now = deps.now ?? new Date();
  const weekKey = weekKeyOf(now.getTime());
  const range = weekRange(weekKey)!;
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, include: { matches: true } });
  const base: AutoWeekResult = { weekKey, created: false, added: 0, skipped: null };
  if (week?.lockedByAdmin) return { ...base, skipped: 'locked' };
  if (week?.status === 'SETTLED') return { ...base, skipped: 'settled' };
  const listed = week?.matches.filter((m) => m.weekId === week.id) ?? [];
  if (listed.length >= WEEK_MATCH_COUNT) return { ...base, skipped: 'full' };
  if (week?.autoCheckedAt && now.getTime() - week.autoCheckedAt.getTime() < AUTO_RETRY_MS) return { ...base, skipped: 'recent' };

  const listFor = deps.fixturesForUtcDate ?? getFixturesByDate;
  const from = new Date(Math.max(now.getTime(), range.startsAt.getTime()));
  const lists = await Promise.all(utcDatesBetween(range.startsAt, range.endsAt).map((d) => (new Date(`${d}T23:59:59Z`) < from ? Promise.resolve([] as Match[]) : listFor(d).catch(() => [] as Match[]))));
  const all = lists.flat();
  // Türk takımı tespiti için haftanın geçmiş günleri de gerekirdi; başlamış günlerin listesi okunmaz (ek istek yok) — dört büyükler sabit listede.
  const have = new Set(listed.map((m) => m.fixtureId));
  const snaps = await prisma.matchSnapshot.findMany({ where: { fixtureId: { in: [...have] } }, select: { leagueId: true, homeTeamId: true, awayTeamId: true } });
  const existing = snaps.map((s) => ({ leagueId: s.leagueId ?? null, homeId: s.homeTeamId, awayId: s.awayTeamId }));
  const raw = candidatesIn(all, range.startsAt, range.endsAt, now).filter((c) => !have.has(c.fixtureId));
  // Başka bir haftanın listesindeki maç alınmaz (fixture başına tek satır; yalnız günlükteki maç haftaya bağlanabilir).
  const elsewhere = new Set(
    (await prisma.gameMatch.findMany({ where: { fixtureId: { in: raw.map((c) => c.fixtureId) }, weekId: { not: null } }, select: { fixtureId: true } })).map((m) => m.fixtureId),
  );
  const cands = raw.filter((c) => !elsewhere.has(c.fixtureId));
  const picks = selectMatches(cands, WEEK_MATCH_COUNT, WEEKLY_LIMITS, existing);

  const snap = deps.snapshot ?? ensureMatchSnapshot;
  const usable: MatchSnapshot[] = [];
  for (const p of picks) {
    try {
      const s = await snap(p.fixtureId);
      if (s.startingAt > now && s.startingAt >= range.startsAt && s.startingAt < range.endsAt) usable.push(s);
    } catch (e) {
      captureError('game-autoweek:snapshot', e);
    }
  }
  if (!week && !usable.length) return { ...base, skipped: 'none' };

  const result = await prisma.$transaction(async (tx) => {
    const w: GameWeek = week
      ? await tx.gameWeek.update({
          where: { id: week.id },
          data: { autoCheckedAt: now, ...(week.status === 'DRAFT' && (listed.length || usable.length) ? { status: 'PUBLISHED', publishedAt: now } : {}) },
        })
      : await tx.gameWeek.upsert({
          where: { weekKey },
          create: { weekKey, season: seasonOf(weekKey)!, status: 'PUBLISHED', startsAt: range.startsAt, endsAt: range.endsAt, publishedAt: now, autoCheckedAt: now },
          update: { autoCheckedAt: now },
        });
    const ids: string[] = [];
    for (const [i, s] of usable.entries()) {
      const m = await tx.gameMatch.upsert({
        where: { fixtureId: s.fixtureId },
        create: { weekId: w.id, position: listed.length + i + 1, fixtureId: s.fixtureId, kickoffAt: s.startingAt },
        update: { weekId: w.id, position: listed.length + i + 1 },
      });
      ids.push(m.id);
    }
    return { w, ids };
  });
  if (result.ids.length) for (const q of [attachWeekToPredictionsSql(result.ids), ensureEntriesForWeekSql(result.w.id)]) await prisma.$executeRawUnsafe(q.text, ...q.values);
  return { ...base, created: !week, added: result.ids.length };
}
