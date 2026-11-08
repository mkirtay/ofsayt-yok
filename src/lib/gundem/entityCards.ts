/**
 * Gündem varlık kartları (oyuncu / takım / maç) — gönderi başına en çok 1 kart.
 *
 * Yazma: istek gövdesindeki `entity: { type, id }` sunucuda doğrulanır (`ensureEntityCard`): `GundemEntitySnapshot`'ta
 * varsa 0 istek, yoksa oyuncu/takım/maç sayfasının AYNI önbellekli kaynaklarından kart üretilir ve kaydedilir. Bulunamayan
 * varlık → 400 (gönderi atılmaz). İstemcinin gönderdiği ad/logo hiç kullanılmaz.
 *
 * Okuma: akış sayfası başına TEK `GundemEntitySnapshot` sorgusu (N+1 yok; gönderi başına Sportmonks isteği yok). Eskimiş
 * kartlar arka planda yenilenir (istek başına en çok `MAX_REFRESH_PER_LIST`, süreç içinde tekilleştirilmiş). Canlı maç
 * skoru ayrıca istemcide ana sayfanın canlı listesinden (home-hub-matches) güncellenir — yeni yoklama döngüsü yok.
 */
import type { GundemEntitySnapshot, PostEntityType, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import type { Match } from '@/models/liveScore';
import type {
  GundemEntityCard,
  GundemEntityRef,
  GundemEntityType,
  GundemMatchCard,
  GundemPlayerCard,
  GundemTeamCard,
} from '@/types/gundem';
import type { PlayerProfile } from '@/services/playerProfile';
import type { PlayerLineupRow } from '@/utils/playerVs';
import type { TeamOverview, TeamSeasonRef } from '@/services/sportmonks/teamOverview';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import { STAT, statMain } from '@/services/sportmonks/playerStatTypes';
import { deriveMatchPhase } from '@/utils/matchPhase';
import { isMatchLive, matchKickoffMs } from '@/utils/matchActivity';
import { parseScore } from '@/utils/parseScore';

export const ENTITY_TYPES = ['PLAYER', 'TEAM', 'MATCH'] as const satisfies readonly GundemEntityType[];
const ID_RE = /^\d{1,12}$/;

/** Kart verisinin şema sürümü (`data.v`); farklı sürüm "eski" sayılır ve yeniden üretilir. */
export const ENTITY_CARD_VERSION = 1;
/** Oyuncu / takım kartı: gol-asist, puan, sıra günde birkaç kez değişir. */
export const ENTITY_STATIC_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Canlı ya da başlamak üzere olan maç kartı (akış önbelleği ~dakikalık; istemci canlı listeden ayrıca yeniler). */
export const ENTITY_LIVE_REFRESH_MS = 60 * 1000;
/** Başlamasına uzun süre olan maç (saat değişikliği / erteleme). */
export const ENTITY_UPCOMING_REFRESH_MS = 6 * 60 * 60 * 1000;
/** Bitmiş maç: bitişten sonra bir kez yenilenince (son skor) bir daha çekilmez. */
const MATCH_ACTIVE_WINDOW_MS = 15 * 60 * 1000;
/** Bir akış isteğinin tetikleyebileceği en çok arka plan yenilemesi. */
export const MAX_REFRESH_PER_LIST = 3;

export type EntityCardErrorReason = 'invalid' | 'not-found' | 'upstream';

/** `invalid`/`not-found` → 400; `upstream` → 503 (tekrar denenebilir). */
export class EntityCardError extends Error {
  constructor(readonly reason: EntityCardErrorReason, message: string) {
    super(message);
    this.name = 'EntityCardError';
  }
}

/** İstek gövdesindeki `entity` → `{ type, id }`; yoksa null, bozuksa `invalid`. */
export function normalizeEntityInput(value: unknown): GundemEntityRef | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new EntityCardError('invalid', 'Geçersiz ek.');
  const { type, id } = value as { type?: unknown; id?: unknown };
  if (typeof type !== 'string' || !(ENTITY_TYPES as readonly string[]).includes(type)) {
    throw new EntityCardError('invalid', 'Geçersiz ek.');
  }
  const idStr = typeof id === 'number' && Number.isSafeInteger(id) ? String(id) : typeof id === 'string' ? id.trim() : '';
  if (!ID_RE.test(idStr) || Number(idStr) <= 0) throw new EntityCardError('invalid', 'Geçersiz ek.');
  return { type: type as GundemEntityType, id: Number(idStr) };
}

export const entityKey = (type: GundemEntityType | PostEntityType, id: string | number) => `${type}:${id}`;

/* ─────────────────────────── Saf kart üreticileri (test edilir) ─────────────────────────── */

/**
 * Oyuncu kartı: güncel sezonun (profilin en yeni sezon adı) GÜNCEL TAKIM satırlarının toplamı (lig + kupalar), son
 * puanlı maçın puanı. Oyuncu sayfasındaki "varsayılan sezon" kuralıyla aynı takım seçilir.
 */
export function buildPlayerCard(profile: PlayerProfile, lineups: PlayerLineupRow[] | null): GundemPlayerCard {
  const latestName = profile.seasons[0]?.seasonName;
  const sameSeason = latestName ? profile.seasons.filter((r) => r.seasonName === latestName) : [];
  const teamId = profile.currentTeam?.id ?? sameSeason.at(-1)?.teamId;
  const rows = sameSeason.filter((r) => (teamId == null || r.teamId === teamId) && statMain(r.stats[STAT.APPEARANCES]) != null);
  const sum = (type: number) => rows.reduce((acc, r) => acc + (statMain(r.stats[type]) ?? 0), 0);
  const rated = (lineups ?? []).filter((r) => typeof r.rating === 'number' && Number.isFinite(r.rating));
  const last = rated.reduce<PlayerLineupRow | null>((best, r) => (!best || r.date > best.date ? r : best), null);
  return {
    type: 'PLAYER',
    id: profile.id,
    name: profile.name,
    photo: profile.photo ?? null,
    team:
      profile.currentTeam?.id != null
        ? { id: profile.currentTeam.id, name: profile.currentTeam.name, logo: profile.currentTeam.logo ?? null }
        : null,
    season: latestName && rows.length ? { name: latestName, goals: sum(STAT.GOALS), assists: sum(STAT.ASSISTS), apps: sum(STAT.APPEARANCES) } : null,
    lastRating: last?.rating ?? null,
  };
}

function allStandingRows(table: CompetitionTableData | null): CompetitionTableStandingRow[] {
  if (!table) return [];
  return [...(table.table ?? []), ...(table.stages ?? []).flatMap((s) => (s.groups ?? []).flatMap((g) => g.standings ?? []))];
}

/**
 * Takımın kart için turnuvası: güncel sezonun turnuvalarından son maçlarda en çok oynanan (takım sayfasının varsayılanı),
 * yoksa listenin ilki. Puan durumu bu turnuvanın o sezonundan okunur.
 */
export function pickTeamStandingSeason(overview: TeamOverview, defaultLeagueId: number | null): TeamSeasonRef | null {
  const seasons = overview.campaigns[0]?.seasons ?? [];
  return seasons.find((s) => s.leagueId === defaultLeagueId) ?? seasons[0] ?? null;
}

export function buildTeamCard(
  overview: TeamOverview,
  season: TeamSeasonRef | null,
  table: CompetitionTableData | null,
): GundemTeamCard | null {
  if (!overview.team) return null;
  const teamId = overview.team.id;
  const row = allStandingRows(table).find((r) => (r.team_id ?? r.team?.id) === teamId);
  return {
    type: 'TEAM',
    id: teamId,
    name: overview.team.name,
    logo: overview.team.logo ?? null,
    standing:
      season && row && Number.isFinite(Number(row.rank))
        ? {
            leagueId: season.leagueId,
            leagueName: season.leagueName ?? table?.competition?.name ?? '',
            leagueLogo: season.leagueLogo ?? null,
            rank: Number(row.rank),
            points: Number(row.points) || 0,
          }
        : null,
  };
}

export function buildMatchCard(match: Match): GundemMatchCard {
  const kickoff = matchKickoffMs(match);
  const phase = deriveMatchPhase(match.status);
  const team = (t: Match['home']) => ({ id: t.id, name: t.name, logo: t.logo ?? null });
  return {
    type: 'MATCH',
    id: Number(match.id),
    league: match.competition?.id ? { id: match.competition.id, name: match.competition.name, logo: match.competition.logo ?? null } : null,
    startingAt: kickoff != null ? new Date(kickoff).toISOString() : null,
    status: match.status,
    stateCode: match.state_code ?? null,
    minute: isMatchLive(match) && match.time ? String(match.time) : null,
    home: team(match.home),
    away: team(match.away),
    score: phase === 'PRE' ? null : parseScore(match.scores?.score ?? match.score),
  };
}

/* ─────────────────────────── Tazelik ─────────────────────────── */

type StoredCard = GundemEntityCard & { v?: number };

/** Kartın yenilenmesi gerekiyor mu? Bitmiş maç, bitişi gördükten sonra bir daha yenilenmez. */
export function isEntityCardStale(card: StoredCard, updatedAt: Date, now: Date): boolean {
  if (card.v !== ENTITY_CARD_VERSION) return true;
  const age = now.getTime() - updatedAt.getTime();
  if (card.type !== 'MATCH') return age > ENTITY_STATIC_REFRESH_MS;
  const phase = deriveMatchPhase(card.status);
  if (phase === 'POST' || card.stateCode === 'CANCELLED' || card.stateCode === 'DELETED') return false;
  if (phase === 'LIVE' || phase === 'HT') return age > ENTITY_LIVE_REFRESH_MS;
  const kickoff = card.startingAt ? Date.parse(card.startingAt) : NaN;
  // Başlamasına 15 dk kalan ya da saati geçmiş (durumu henüz değişmemiş) maç: canlı aralıkla.
  if (Number.isFinite(kickoff) && now.getTime() >= kickoff - MATCH_ACTIVE_WINDOW_MS) return age > ENTITY_LIVE_REFRESH_MS;
  return age > ENTITY_UPCOMING_REFRESH_MS;
}

/* ─────────────────────────── Kaynaklar (önbellekli; testte değiştirilir) ─────────────────────────── */

export type EntityLoaders = {
  player: (id: number) => Promise<GundemPlayerCard | null>;
  team: (id: number) => Promise<GundemTeamCard | null>;
  match: (id: number) => Promise<GundemMatchCard | null>;
};

/**
 * Oyuncu: oyuncu sayfasının `players/{id}` profil isteği + maç satırları (`sportmonks:player-lineups:{id}`, 12 sa).
 * Satırlar alınamazsa puan rozetsiz kart (profil yeterli).
 */
async function loadPlayer(id: number): Promise<GundemPlayerCard | null> {
  const { getPlayerProfile } = await import('@/services/playerProfile');
  const { getPlayerLineupRows } = await import('@/services/playerLineups');
  const profile = await getPlayerProfile(id);
  if (!profile || profile.id !== id || !profile.name) return null;
  const lineups = await getPlayerLineupRows(id).catch(() => null);
  return buildPlayerCard(profile, lineups);
}

/** Takım: takım sayfasının `teams/{id}` isteği + aynı turnuva/sezonun puan durumu (takım sayfasıyla aynı anahtar). */
async function loadTeam(id: number): Promise<GundemTeamCard | null> {
  const { getTeamOverview } = await import('@/services/teamPage');
  const { defaultCompetitionId } = await import('@/services/sportmonks/teamOverview');
  const { getCompetitionStandings } = await import('@/services/competitionStandings');
  const overview = await getTeamOverview(String(id));
  if (!overview.team || overview.team.id !== id) return null;
  const season = pickTeamStandingSeason(overview, defaultCompetitionId(overview.recent, overview.fixtures));
  const table = season ? await getCompetitionStandings(String(season.leagueId), { season: season.id }) : null;
  return buildTeamCard(overview, season, table);
}

/** Maç: maç sayfasının tek `fixtures/{id}` isteği (aynı önbellek anahtarı). */
async function loadMatch(id: number): Promise<GundemMatchCard | null> {
  const { fetchMatchWithEvents } = await import('@/services/liveScoreService');
  const { match } = await fetchMatchWithEvents(String(id));
  if (!match || Number(match.id) !== id || !match.home?.name || !match.away?.name) return null;
  return buildMatchCard(match);
}

const defaultLoaders: EntityLoaders = { player: loadPlayer, team: loadTeam, match: loadMatch };

function loaderFor(type: GundemEntityType, loaders: EntityLoaders) {
  return type === 'PLAYER' ? loaders.player : type === 'TEAM' ? loaders.team : loaders.match;
}

/* ─────────────────────────── Önbellek tablosu ─────────────────────────── */

async function buildAndStore(ref: GundemEntityRef, loaders: EntityLoaders): Promise<GundemEntityCard> {
  let card: GundemEntityCard | null;
  try {
    card = await loaderFor(ref.type, loaders)(ref.id);
  } catch (e) {
    captureError('gundem:entity-card', e);
    throw new EntityCardError('upstream', 'Ek şu an doğrulanamadı. Biraz sonra tekrar deneyin.');
  }
  if (!card) throw new EntityCardError('not-found', 'Eklenen oyuncu, takım ya da maç bulunamadı.');
  const data = { ...card, v: ENTITY_CARD_VERSION } as unknown as Prisma.InputJsonObject;
  const entityId = String(ref.id);
  await prisma.gundemEntitySnapshot.upsert({
    where: { entityType_entityId: { entityType: ref.type, entityId } },
    create: { entityType: ref.type, entityId, data },
    update: { data },
  });
  return card;
}

const inflight = new Map<string, Promise<unknown>>();

/** Arka planda yeniler (hata yutulur). Sunucusuz ortamda "best effort": tamamlanmazsa sonraki istek yeniden dener. */
export function refreshEntityCardInBackground(ref: GundemEntityRef, loaders: EntityLoaders = defaultLoaders): Promise<unknown> {
  const key = entityKey(ref.type, ref.id);
  const running = inflight.get(key);
  if (running) return running;
  const p = buildAndStore(ref, loaders)
    .catch((e) => {
      if (!(e instanceof EntityCardError)) captureError('gundem:entity-card-refresh', e);
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function storedCard(row: GundemEntitySnapshot): StoredCard | null {
  const d = row.data as unknown;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const card = d as StoredCard;
  return card.type === row.entityType && String(card.id) === row.entityId ? card : null;
}

function publicCard(card: StoredCard): GundemEntityCard {
  const { v: _v, ...rest } = card;
  return rest as GundemEntityCard;
}

/**
 * Yazma anında doğrulama: kayıt varsa onu döndürür (eskiyse arka planda yeniler), yoksa kaynaklardan üretip kaydeder.
 * Çözülemezse `EntityCardError` fırlatır.
 */
export async function ensureEntityCard(
  ref: GundemEntityRef,
  deps: { loaders?: EntityLoaders; now?: () => Date } = {},
): Promise<GundemEntityCard> {
  const loaders = deps.loaders ?? defaultLoaders;
  const row = await prisma.gundemEntitySnapshot.findUnique({
    where: { entityType_entityId: { entityType: ref.type, entityId: String(ref.id) } },
  });
  const card = row ? storedCard(row) : null;
  if (row && card && card.v === ENTITY_CARD_VERSION) {
    if (isEntityCardStale(card, row.updatedAt, (deps.now ?? (() => new Date()))())) void refreshEntityCardInBackground(ref, loaders);
    return publicCard(card);
  }
  return buildAndStore(ref, loaders);
}

/**
 * Akış sayfasındaki gönderilerin kartları — TEK sorgu. Dönüş: `entityKey → kart`; kaydı olmayan / bozuk kayıt haritada
 * yok (kart gizlenir). Eskiyenler arka planda yenilenir (en çok `MAX_REFRESH_PER_LIST`); eski hâli bu yanıtta kalır.
 */
export async function loadEntityCards(
  refs: Array<{ entityType: PostEntityType | null; entityId: string | null }>,
  deps: { loaders?: EntityLoaders; now?: () => Date } = {},
): Promise<Map<string, GundemEntityCard>> {
  const unique = new Map<string, { entityType: PostEntityType; entityId: string }>();
  for (const r of refs) {
    if (r.entityType && r.entityId) unique.set(entityKey(r.entityType, r.entityId), { entityType: r.entityType, entityId: r.entityId });
  }
  const out = new Map<string, GundemEntityCard>();
  if (!unique.size) return out;
  const rows = await prisma.gundemEntitySnapshot.findMany({ where: { OR: [...unique.values()] } });
  const now = (deps.now ?? (() => new Date()))();
  let refreshes = 0;
  for (const row of rows) {
    const card = storedCard(row);
    if (!card) continue;
    if (card.v === ENTITY_CARD_VERSION) out.set(entityKey(row.entityType, row.entityId), publicCard(card));
    if (refreshes < MAX_REFRESH_PER_LIST && isEntityCardStale(card, row.updatedAt, now)) {
      refreshes += 1;
      void refreshEntityCardInBackground({ type: row.entityType, id: Number(row.entityId) }, deps.loaders ?? defaultLoaders);
    }
  }
  return out;
}
