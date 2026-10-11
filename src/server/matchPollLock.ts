/**
 * Topluluk tahmini POST'u için "maç başladı mı" kararı — YENİ bir Sportmonks istek türü eklemeden:
 *
 * 1. Paylaşımlı gün listeleri (`fixtures/date/{d}`, ana sayfayla aynı cache anahtarları): UTC dün + bugün. Durum
 *    bilgisi taşır (canlı/bitti/ertelendi) → en güvenilir kaynak. Başlamış her maç bu iki listeden birindedir
 *    (UTC dünden eskiyse bitmiştir; o durum 2. adıma kalır).
 * 2. `MatchSnapshot` (gündem rozetleri, yalnız DB okuması): başlama saati geçtiyse kilit.
 * 3. Hiç veri yok → açık (fail-open). Bilinmeyen maçı kilitlemek anketi sebepsiz kapatırdı; uç IP + kullanıcı
 *    limitli olduğundan kötüye kullanım sınırlı.
 *
 * Bilinen boşluk: UTC dünden eski VE snapshot'ı olmayan maç açık görünür (istemci yine kilitli çizer).
 */
import type { Match } from '@/models/liveScore';
import { prisma } from '@/lib/prisma';
import { getFixturesByDate } from '@/services/liveScoreService';
import { shiftIsoDate } from '@/utils/dateStrip';
import { isPollLockedForKickoff, isPollLockedForMatch } from '@/utils/matchPollLock';

export type PollLockSource = 'day-list' | 'snapshot' | 'none';
export type PollLockDecision = { locked: boolean; source: PollLockSource };

export type PollLockDeps = {
  fixturesByDate?: (isoDate: string) => Promise<Match[]>;
  snapshotStartingAt?: (fixtureId: string) => Promise<Date | null>;
  now?: () => number;
};

const defaultSnapshotStartingAt = async (fixtureId: string): Promise<Date | null> => {
  const row = await prisma.matchSnapshot.findUnique({ where: { fixtureId }, select: { startingAt: true } });
  return row?.startingAt ?? null;
};

function sameMatch(m: Match, matchId: string): boolean {
  return String(m.id) === matchId || (m.fixture_id != null && String(m.fixture_id) === matchId);
}

export async function resolvePollLock(matchId: string, deps: PollLockDeps = {}): Promise<PollLockDecision> {
  const now = (deps.now ?? Date.now)();
  const fixturesByDate = deps.fixturesByDate ?? getFixturesByDate;
  const today = new Date(now).toISOString().slice(0, 10);

  // `getFixturesByDate` hatada boş liste döner → "bulunamadı" gibi davranılır, snapshot'a geçilir.
  const [yesterdayList, todayList] = await Promise.all([fixturesByDate(shiftIsoDate(today, -1)), fixturesByDate(today)]);
  const fromList = [...todayList, ...yesterdayList].find((m) => sameMatch(m, matchId));
  if (fromList) return { locked: isPollLockedForMatch(fromList, now), source: 'day-list' };

  const startingAt = await (deps.snapshotStartingAt ?? defaultSnapshotStartingAt)(matchId);
  if (startingAt) return { locked: isPollLockedForKickoff(startingAt, now), source: 'snapshot' };

  return { locked: false, source: 'none' };
}
