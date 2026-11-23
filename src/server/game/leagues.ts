/**
 * Tahmin oyunu özel ligleri (büyüme raporu 2.2): arkadaş / ofis ligi. Kurucu ad verir, 8 karakterlik davet kodu üretilir
 * (paylaşım: /tahmin/lig/{kod}, WhatsApp linki). Sıralama ayrı puan tutmaz: üyelerin GameWeekEntry toplamları
 * (lib/game/sql.ts leagueSeasonSql / leagueWeekSql). Ödül yok (yalnız sıralama) → ödüllü yarışma mevzuatına girmez.
 *
 * Sınırlar: kişi başına en çok MAX_OWNED kurduğu, MAX_JOINED üye olduğu lig; lig başına MAX_MEMBERS üye.
 */
import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { isUniqueViolation } from '@/lib/credits';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { isProfileTextAllowed } from '@/lib/moderation/contentGate';
import { leagueSeasonSql, leagueWeekSql, type SqlQuery } from '@/lib/game/sql';
import { seasonOf, weekKeyOf } from '@/lib/game/week';
import { GAME_BRAND } from '@/config/brand';

export const MAX_OWNED = 5;
export const MAX_JOINED = 15;
export const MAX_MEMBERS = 50;
export const NAME_MIN = 3;
export const NAME_MAX = 40;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

export class LeagueError extends Error {
  constructor(
    public code: 'NAME_INVALID' | 'NAME_BLOCKED' | 'OWN_LIMIT' | 'JOIN_LIMIT' | 'FULL' | 'NOT_FOUND' | 'NOT_MEMBER',
    message: string,
  ) {
    super(message);
    this.name = 'LeagueError';
  }
}

export function normalizeLeagueCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c)) ? code : null;
}

function newCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Ad: kırpılır, boşluklar teke iner; 3–40 karakter; bahis terimi ve ağır küfür yok. */
export async function cleanLeagueName(raw: unknown): Promise<string> {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new LeagueError('NAME_INVALID', `Lig adı ${NAME_MIN}–${NAME_MAX} karakter olmalı.`);
  if (findGamblingTerms(name).length > 0 || !(await isProfileTextAllowed(name))) throw new LeagueError('NAME_BLOCKED', 'Bu lig adı kullanılamaz.');
  return name;
}

export type LeagueSummary = { id: string; name: string; code: string; owner: boolean; members: number };

export async function createLeague(userId: string, rawName: unknown): Promise<LeagueSummary> {
  const name = await cleanLeagueName(rawName);
  const owned = await prisma.gameLeague.count({ where: { ownerId: userId } });
  if (owned >= MAX_OWNED) throw new LeagueError('OWN_LIMIT', `En çok ${MAX_OWNED} lig kurabilirsin.`);
  const joined = await prisma.gameLeagueMember.count({ where: { userId } });
  if (joined >= MAX_JOINED) throw new LeagueError('JOIN_LIMIT', `En çok ${MAX_JOINED} lige üye olabilirsin.`);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const league = await prisma.gameLeague.create({
        data: { name, code: newCode(), ownerId: userId, members: { create: { userId } } },
        select: { id: true, name: true, code: true },
      });
      return { ...league, owner: true, members: 1 };
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // kod çakıştı → yeni kod
    }
  }
  throw new Error('Davet kodu üretilemedi');
}

export async function joinLeague(userId: string, rawCode: unknown): Promise<LeagueSummary> {
  const code = normalizeLeagueCode(rawCode);
  const league = code ? await prisma.gameLeague.findUnique({ where: { code }, select: { id: true, name: true, code: true, ownerId: true, _count: { select: { members: true } } } }) : null;
  if (!league) throw new LeagueError('NOT_FOUND', 'Lig bulunamadı. Davet kodunu kontrol et.');
  const already = await prisma.gameLeagueMember.findUnique({ where: { leagueId_userId: { leagueId: league.id, userId } }, select: { userId: true } });
  if (!already) {
    if (league._count.members >= MAX_MEMBERS) throw new LeagueError('FULL', `Bu lig dolu (en çok ${MAX_MEMBERS} üye).`);
    const joined = await prisma.gameLeagueMember.count({ where: { userId } });
    if (joined >= MAX_JOINED) throw new LeagueError('JOIN_LIMIT', `En çok ${MAX_JOINED} lige üye olabilirsin.`);
    try {
      await prisma.gameLeagueMember.create({ data: { leagueId: league.id, userId } });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // eşzamanlı ikinci istek
    }
  }
  return { id: league.id, name: league.name, code: league.code, owner: league.ownerId === userId, members: league._count.members + (already ? 0 : 1) };
}

/** Üye ayrılır; kurucu ayrılırsa lig silinir (üyelikler CASCADE). */
export async function leaveLeague(userId: string, leagueId: string): Promise<{ deleted: boolean }> {
  const league = await prisma.gameLeague.findUnique({ where: { id: leagueId }, select: { ownerId: true } });
  if (!league) throw new LeagueError('NOT_FOUND', 'Lig bulunamadı.');
  if (league.ownerId === userId) {
    await prisma.gameLeague.delete({ where: { id: leagueId } });
    return { deleted: true };
  }
  const { count } = await prisma.gameLeagueMember.deleteMany({ where: { leagueId, userId } });
  if (count === 0) throw new LeagueError('NOT_MEMBER', 'Bu ligin üyesi değilsin.');
  return { deleted: false };
}

export async function listMyLeagues(userId: string): Promise<LeagueSummary[]> {
  const rows = await prisma.gameLeagueMember.findMany({
    where: { userId },
    orderBy: { joinedAt: 'asc' },
    select: { league: { select: { id: true, name: true, code: true, ownerId: true, _count: { select: { members: true } } } } },
  });
  return rows.map(({ league: l }) => ({ id: l.id, name: l.name, code: l.code, owner: l.ownerId === userId, members: l._count.members }));
}

export type LeagueStandingRow = { userId: string; nickname: string; image: string | null; points: number; exact: number; direction: number; picks: number };
export type LeagueView = {
  id: string;
  name: string;
  code: string;
  members: number;
  /** İsteyen üye mi (katıl düğmesi / ayrıl düğmesi). */
  member: boolean;
  owner: boolean;
  season: { key: string; rows: LeagueStandingRow[] };
  week: { key: string; rows: LeagueStandingRow[] } | null;
};

const raw = <T,>(q: SqlQuery) => prisma.$queryRawUnsafe<T[]>(q.text, ...q.values);
const toRows = (rows: { userId: string; nickname: string; image: string | null; points: number; exact: number; direction: number; picks: number }[]): LeagueStandingRow[] =>
  rows.map((r) => ({ userId: r.userId, nickname: r.nickname, image: r.image, points: Number(r.points), exact: Number(r.exact), direction: Number(r.direction), picks: Number(r.picks) }));

/** Kodla lig görünümü: sezon + bu haftanın sıralaması. Kod bilen herkes görür (davet sayfası); üye olmayan katılabilir. */
export async function loadLeagueView(rawCode: unknown, viewerId: string | null, now: Date = new Date()): Promise<LeagueView | null> {
  const code = normalizeLeagueCode(rawCode);
  if (!code) return null;
  const league = await prisma.gameLeague.findUnique({ where: { code }, select: { id: true, name: true, code: true, ownerId: true, _count: { select: { members: true } } } });
  if (!league) return null;
  const weekKey = weekKeyOf(now.getTime());
  const week = await prisma.gameWeek.findUnique({ where: { weekKey }, select: { id: true, season: true, status: true } });
  const season = week?.season ?? seasonOf(weekKey)!;
  const [seasonRows, weekRows, membership] = await Promise.all([
    raw<Parameters<typeof toRows>[0][number]>(leagueSeasonSql(league.id, season)),
    week && week.status !== 'DRAFT' ? raw<Parameters<typeof toRows>[0][number]>(leagueWeekSql(league.id, week.id)) : Promise.resolve(null),
    viewerId ? prisma.gameLeagueMember.findUnique({ where: { leagueId_userId: { leagueId: league.id, userId: viewerId } }, select: { userId: true } }) : null,
  ]);
  return {
    id: league.id,
    name: league.name,
    code: league.code,
    members: league._count.members,
    member: !!membership,
    owner: viewerId != null && league.ownerId === viewerId,
    season: { key: season, rows: toRows(seasonRows) },
    week: weekRows ? { key: weekKey, rows: toRows(weekRows) } : null,
  };
}

/** Paylaşım metni + WhatsApp linki (istemci de aynısını kurar; sunucu testleri için burada). */
export function leagueInviteText(name: string, url: string): string {
  return `"${name}" özel ligine katıl (${GAME_BRAND.name}): haftanın maçlarının skorunu tahmin et, aramızdaki sıralamada yarışalım. Ücretsiz. ${url}`;
}
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
