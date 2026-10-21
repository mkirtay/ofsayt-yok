/**
 * X botu poller (`POST /api/admin/x/tick`, dakikada bir harici cron). Gol ve maç sonu tweet'i atar; ONAY YOK (kullanıcı kararı,
 * 2026-10-21: ilk hatalar tolere edilir, sonra iyileştirilir). Güvenlik ağları: (1) gol ancak İKİ ardışık tick'te listede
 * görünürse atılır (VAR iptali elenir), (2) bota ilk girişte maçta zaten olan goller atılmaz (baseline), (3) tick başına en
 * fazla `X_BOT_MAX_TWEETS_PER_TICK` tweet, (4) mükerrer önleme Redis `SET NX` ile, (5) Redis yoksa HİÇ tweet atılmaz.
 *
 * Veri: Gündem botuyla AYNI `livescores/inplay` (paylaşımlı önbellek; ek Sportmonks yükü ~0). Maç sonu: maç inplay listesinden
 * düşünce `resolveLiveMatch` (maç sayfasıyla ortak önbellek) FINISHED diyorsa; skor + goller buradan, görsel sitenin OG kartı.
 * Mod: `X_BOT_MODE` = off | dry | live (bkz. config/xBot.ts). `dry` ayrı Redis anahtarları kullanır (sonra `live`a geçince etkilemez).
 */
import {
  getXBotLeagueIds,
  getXBotMode,
  X_BOT_FINAL_MAX_TRIES,
  X_BOT_MAX_TWEETS_PER_TICK,
  X_BOT_SEEN_TTL_SECONDS,
  X_BOT_SENT_TTL_SECONDS,
  type XBotMode,
} from '@/config/xBot';
import { buildGoalDraft } from '@/lib/gundem/bot/goalDraft';
import { goalKindOf, sortEvents } from '@/lib/gundem/bot/goalStanding';
import { fetchInplayFixtures, isInplayPoolCoolingDown, isSportmonksRateLimit, startedRecently } from '@/lib/gundem/bot/tick';
import { captureError } from '@/lib/logger';
import { withRedis } from '@/lib/redis';
import { resolveLiveMatch, type ResolvedLiveMatch } from '@/lib/resolveLiveMatch';
import { renderMatchOgImage } from '@/server/og/matchOgImage';
import { trackSportmonksFetches } from '@/server/sportmonks/cachedFetch';
import { getFixturesByDate } from '@/services/liveScoreService';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { hasActiveMatch } from '@/utils/matchActivity';
import { createXPoster, type XPoster } from './xClient';
import { renderFinalTweet, renderGoalTweet, type FinalFacts, type FinalGoal } from './templates';

export type XTickSummary = {
  mode: XBotMode;
  idle: boolean;
  inplay: number;
  tracked: number;
  /** İlk görüldü, sonraki tick'te hâlâ listedeyse atılacak goller. */
  pending: number;
  /** Bota girişte zaten olan goller (atılmadı). */
  baselined: number;
  sent: number;
  errors: number;
  /** `dry` modunda üretilen tweet'ler. */
  dry: { kind: 'goal' | 'final'; text: string; image: boolean }[];
  degraded?: 'inplay' | 'redis' | 'rate-limited' | 'no-keys';
};

export type XTickDeps = {
  fetchInplay: () => Promise<SportmonksFixture[]>;
  shouldPoll: (now: Date) => Promise<boolean>;
  isRateLimited: (now: Date) => Promise<boolean>;
  resolveMatch: (id: number) => Promise<ResolvedLiveMatch | null>;
  renderImage: (match: ResolvedLiveMatch['match']) => Promise<Buffer | null>;
  poster: () => XPoster | null;
  mode?: () => XBotMode;
  now?: () => Date;
};

const FINISHED = new Set(['FINISHED', 'FT', 'AET', 'PEN', 'FT_PEN', 'FULL TIME', 'ENDED']);
const GOAL_EVENT: Record<string, boolean | undefined> = { GOAL: false, PENALTY: false, OWN_GOAL: true };

export async function hasActiveXFixtures(now: Date): Promise<boolean> {
  const leagueIds = getXBotLeagueIds();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000).toISOString().slice(0, 10);
  const { value, failed } = await trackSportmonksFetches(() => Promise.all([getFixturesByDate(yesterday), getFixturesByDate(today)]));
  if (failed) return true;
  return hasActiveMatch(value.flat().filter((m) => leagueIds.has(Number(m.competition?.id))), now.getTime());
}

async function defaultRenderImage(match: ResolvedLiveMatch['match']): Promise<Buffer | null> {
  try {
    return Buffer.from(await (await renderMatchOgImage(match)).arrayBuffer());
  } catch (e) {
    captureError('xbot:og-image', e);
    return null;
  }
}

export const defaultXTickDeps: XTickDeps = {
  fetchInplay: fetchInplayFixtures,
  shouldPoll: hasActiveXFixtures,
  isRateLimited: isInplayPoolCoolingDown,
  resolveMatch: (id) => resolveLiveMatch(String(id)),
  renderImage: defaultRenderImage,
  poster: () => createXPoster(),
};

// ─── Redis yardımcıları (Redis yoksa / hata → "alınamadı": hiçbir şey atılmaz) ─────────────────────────

const claim = async (key: string, ttl: number): Promise<boolean> =>
  (await withRedis((r) => r.set(key, '1', { nx: true, ex: ttl }), null)) === 'OK';
const release = (key: string) => withRedis((r) => r.del(key), 0);
const bump = (key: string, ttl: number) =>
  withRedis(async (r) => {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, ttl);
    return n;
  }, 0);

/** Biten maçın sonuç bilgisi (resolveLiveMatch → tweet gerçekleri). */
export function finalFactsOf(m: ResolvedLiveMatch): FinalFacts | null {
  const score = String(m.match.scores?.score ?? '').match(/^\s*(\d+)\s*[-:]\s*(\d+)\s*$/);
  if (!score) return null;
  const goals: FinalGoal[] = [...m.events]
    .filter((e) => GOAL_EVENT[e.event] !== undefined)
    .sort((a, b) => a.time - b.time || a.sort - b.sort)
    .map((e) => ({ minute: e.time, player: e.player?.name?.trim() || '?', side: e.is_home ? 'home' : 'away', own: GOAL_EVENT[e.event] }));
  const ps = String(m.match.scores?.ps_score ?? '').trim();
  const note = m.match.finish === 'PEN' ? (ps ? `Penaltılar ${ps}` : 'Penaltılarla') : m.match.finish === 'AET' ? 'Uzatmalar sonucu' : null;
  return {
    homeName: m.match.home?.name ?? 'Ev Sahibi',
    awayName: m.match.away?.name ?? 'Deplasman',
    score: [Number(score[1]), Number(score[2])],
    leagueName: m.match.competition?.name || m.match.competition_name || null,
    goals,
    note,
  };
}

export async function runXTick(deps: XTickDeps = defaultXTickDeps): Promise<XTickSummary> {
  const mode = deps.mode?.() ?? getXBotMode();
  const summary: XTickSummary = { mode, idle: false, inplay: 0, tracked: 0, pending: 0, baselined: 0, sent: 0, errors: 0, dry: [] };
  if (mode === 'off') return summary;
  const poster = mode === 'live' ? deps.poster() : null;
  if (mode === 'live' && !poster) return { ...summary, degraded: 'no-keys' };
  const now = deps.now?.() ?? new Date();
  const p = mode === 'live' ? 'xbot:' : 'xbot:dry:';
  const leagueIds = getXBotLeagueIds();

  try {
    if (await deps.isRateLimited(now)) return { ...summary, degraded: 'rate-limited' };
  } catch {
    // karar verilemezse normal akış
  }
  let poll = true;
  try {
    poll = await deps.shouldPoll(now);
  } catch (e) {
    captureError('xbot:shouldPoll', e);
  }
  // Boşta tick: yalnız "bitmesi beklenen maç" kontrolü için canlı listeye bakılır (aşağıda), inplay'e gidilmez.
  const prevLive = (await withRedis((r) => r.get<number[]>(`${p}live`), null)) ?? [];
  if (!poll && prevLive.length === 0) return { ...summary, idle: true };

  let inplay: SportmonksFixture[] = [];
  if (poll) {
    try {
      inplay = await deps.fetchInplay();
    } catch (e) {
      if (isSportmonksRateLimit(e)) return { ...summary, degraded: 'rate-limited' };
      captureError('xbot:inplay', e);
      return { ...summary, errors: 1, degraded: 'inplay' };
    }
  }
  summary.inplay = inplay.length;
  const tracked = inplay.filter((f) => f.league_id != null && leagueIds.has(f.league_id) && startedRecently(f.starting_at, now));
  summary.tracked = tracked.length;
  let budget = X_BOT_MAX_TWEETS_PER_TICK;

  const send = async (kind: 'goal' | 'final', text: string, image: Buffer | null): Promise<boolean> => {
    if (mode === 'dry') {
      summary.dry.push({ kind, text, image: image != null });
      return true;
    }
    await poster!.post(text, image ?? undefined);
    summary.sent += 1;
    return true;
  };

  // ── Goller ─────────────────────────────────────────────────────────────────
  for (const fixture of tracked) {
    try {
      const goals = sortEvents((fixture.events ?? []).filter((e) => goalKindOf(e) !== null));
      const firstSighting = await claim(`${p}fx:${fixture.id}`, X_BOT_SENT_TTL_SECONDS);
      for (const goal of goals) {
        const base = `goal:${fixture.id}:${goal.id}`;
        if (firstSighting) {
          // Bota girişte maçta zaten olan goller: atılmaz, işaretlenir.
          await claim(`${p}seen:${base}`, X_BOT_SEEN_TTL_SECONDS);
          await claim(`${p}sent:${base}`, X_BOT_SENT_TTL_SECONDS);
          summary.baselined += 1;
          continue;
        }
        if (await claim(`${p}seen:${base}`, X_BOT_SEEN_TTL_SECONDS)) {
          summary.pending += 1; // ilk görüş → bir sonraki tick'te hâlâ varsa atılır
          continue;
        }
        if (budget <= 0) continue;
        if (!(await claim(`${p}sent:${base}`, X_BOT_SENT_TTL_SECONDS))) continue; // zaten atıldı (ya da Redis yok)
        const draft = buildGoalDraft({ fixture, eventId: goal.id, scorers: null, now });
        if (!draft.ok) continue;
        try {
          await send('goal', renderGoalTweet(draft.facts, fixture.id + goal.minute), null);
          budget -= 1;
        } catch (e) {
          // Atılamadı: işareti bırak, 3 denemeye kadar yeniden dene (sonra vazgeç; sonsuz maliyet döngüsü olmasın).
          captureError('xbot:post-goal', e);
          summary.errors += 1;
          if ((await bump(`${p}tries:${base}`, 3600)) < 3) await release(`${p}sent:${base}`);
        }
      }
    } catch (e) {
      summary.errors += 1;
      captureError('xbot:goal', e);
    }
  }

  // ── Maç sonu: inplay'den düşen maçlar ─────────────────────────────────────
  const curIds = new Set(tracked.map((f) => f.id));
  const keep: number[] = [...curIds];
  for (const id of prevLive.filter((x) => !curIds.has(x))) {
    try {
      if (budget <= 0) {
        keep.push(id);
        continue;
      }
      const resolved = await deps.resolveMatch(id);
      if (!resolved || !FINISHED.has(String(resolved.match.status).toUpperCase())) {
        if ((await bump(`${p}finalTries:${id}`, 6 * 3600)) < X_BOT_FINAL_MAX_TRIES) keep.push(id);
        continue;
      }
      if (!(await claim(`${p}sent:final:${id}`, X_BOT_SENT_TTL_SECONDS))) continue;
      const facts = finalFactsOf(resolved);
      if (!facts) continue;
      try {
        await send('final', renderFinalTweet(facts), await deps.renderImage(resolved.match));
        budget -= 1;
      } catch (e) {
        captureError('xbot:post-final', e);
        summary.errors += 1;
        if ((await bump(`${p}tries:final:${id}`, 3600)) < 3) {
          await release(`${p}sent:final:${id}`);
          keep.push(id);
        }
      }
    } catch (e) {
      summary.errors += 1;
      captureError('xbot:final', e);
    }
  }
  const ok = await withRedis((r) => r.set(`${p}live`, keep, { ex: 6 * 3600 }), null);
  if (ok == null && (summary.pending > 0 || curIds.size > 0)) summary.degraded = 'redis';
  return summary;
}
