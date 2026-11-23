/**
 * Favori takım web bildirimleri (büyüme raporu 3.1): harici cron dakikada bir `/api/cron/push-tick` → bu tik.
 *  - GOL: canlı maç listesinden (sitenin paylaşımlı önbelleği; ek kota yok denecek kadar az) favori takımın maçında skor
 *    arttıysa "⚽ GOL!" bildirimi. Son skor Redis'te (`push:score:{id}`), ilk görüşte yalnız kaydedilir (eski goller atılmaz).
 *  - KADRO: bugünün başlamamış maçlarında resmî kadro (`confirmed`) ilk görüldüğünde "Kadrolar açıklandı" (bir kez).
 * Yalnız web aboneliği olan ve favori takımı olan kullanıcılar; abonelik yoksa Sportmonks'a hiç gidilmez.
 * Gönderim için yalnız VAPID_PRIVATE_KEY gerekir (lib/webPush.ts).
 */
import { prisma } from '@/lib/prisma';
import { readCache, writeCache } from '@/lib/livescoreCache';
import { captureError } from '@/lib/logger';
import { sendWebPush, webPushEnabled, type PushPayload } from '@/lib/webPush';
import { buildMatchHref } from '@/utils/matchUrl';
import type { Match } from '@/models/liveScore';

const DAY = 86_400;
const MAX_LINEUP_CHECKS = 12;

export type Subscriber = { tokenId: string; token: string; teams: Set<number> };
export type PushEvent = { teamIds: number[]; payload: PushPayload };

const teamIdsOf = (m: Match) => [Number(m.home?.id ?? m.home_id), Number(m.away?.id ?? m.away_id)].filter((n) => Number.isInteger(n) && n > 0);
const totalGoals = (score: string | undefined) => {
  const m = /^(\d+)\s*-\s*(\d+)$/.exec((score ?? '').trim());
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
};

/** Saf: önceki skor → yeni skor; artan taraf için gol olayı (ilk görüşte olay yok). */
export function goalEvents(m: Match, prev: { home: number; away: number } | null): PushEvent[] {
  const now = totalGoals(m.scores?.score ?? m.score);
  if (!now || !prev) return [];
  const out: PushEvent[] = [];
  const href = buildMatchHref({ id: m.id, home: { name: m.home.name }, away: { name: m.away.name } });
  const line = `${m.home.name} ${now.home}-${now.away} ${m.away.name}`;
  for (const side of ['home', 'away'] as const) {
    if (now[side] > prev[side]) {
      const team = side === 'home' ? m.home.name : m.away.name;
      out.push({ teamIds: teamIdsOf(m), payload: { title: `⚽ GOL! ${team}`, body: `${line}${m.time ? ` · ${m.time}` : ''}`, url: href, tag: `goal-${m.id}-${now.home}-${now.away}` } });
    }
  }
  return out;
}

export async function loadSubscribers(): Promise<Subscriber[]> {
  const rows = await prisma.pushToken.findMany({
    where: { platform: 'web', disabledAt: null, user: { favoriteTeamIds: { isEmpty: false } } },
    select: { id: true, token: true, user: { select: { favoriteTeamIds: true } } },
  });
  return rows.map((r) => ({ tokenId: r.id, token: r.token, teams: new Set(r.user.favoriteTeamIds) }));
}

async function deliver(subs: Subscriber[], events: PushEvent[]): Promise<{ sent: number; gone: number }> {
  let sent = 0;
  const gone: string[] = [];
  for (const ev of events) {
    for (const s of subs) {
      if (!ev.teamIds.some((id) => s.teams.has(id))) continue;
      const r = await sendWebPush(s.token, ev.payload);
      if (r === 'ok') sent += 1;
      else if (r === 'gone') gone.push(s.tokenId);
    }
  }
  if (gone.length) await prisma.pushToken.updateMany({ where: { id: { in: gone } }, data: { disabledAt: new Date() } });
  return { sent, gone: gone.length };
}

export async function runPushTick(): Promise<{ skipped?: string; subscribers?: number; events?: number; sent?: number; gone?: number }> {
  if (!webPushEnabled()) return { skipped: 'disabled' };
  const subs = await loadSubscribers();
  if (!subs.length) return { skipped: 'no-subscribers', subscribers: 0 };
  const favs = new Set(subs.flatMap((s) => [...s.teams]));
  const { getLiveMatches, getFixturesByDate, getMatchLineups } = await import('@/services/liveScoreService');
  const events: PushEvent[] = [];

  // Goller
  const live = (await getLiveMatches()).matches.filter((m) => teamIdsOf(m).some((id) => favs.has(id)));
  for (const m of live) {
    const key = `push:score:${m.id}`;
    const prev = (await readCache(key)) as { home: number; away: number } | null;
    events.push(...goalEvents(m, prev));
    const now = totalGoals(m.scores?.score ?? m.score);
    if (now) await writeCache(key, now, DAY);
  }

  // Kadrolar (bugün, başlamamış, favori takım; maç başına bir kez)
  try {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = (await getFixturesByDate(today)).filter((m) => m.status === 'NOT STARTED' && teamIdsOf(m).some((id) => favs.has(id)));
    let checks = 0;
    for (const m of upcoming) {
      if (checks >= MAX_LINEUP_CHECKS) break;
      const key = `push:lineup:${m.id}`;
      if (await readCache(key)) continue;
      checks += 1;
      const lu = await getMatchLineups(String(m.id));
      if (!lu?.confirmed) continue;
      await writeCache(key, 1, 2 * DAY);
      events.push({
        teamIds: teamIdsOf(m),
        payload: { title: 'Kadrolar açıklandı', body: `${m.home.name} - ${m.away.name}: ilk 11'ler belli oldu.`, url: buildMatchHref({ id: m.id, home: { name: m.home.name }, away: { name: m.away.name } }), tag: `lineup-${m.id}` },
      });
    }
  } catch (e) {
    captureError('push-tick-lineups', e);
  }

  const r = events.length ? await deliver(subs, events) : { sent: 0, gone: 0 };
  return { subscribers: subs.length, events: events.length, ...r };
}
