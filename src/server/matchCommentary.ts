/**
 * Maç anlatımı (`/api/matches/[id]/commentary`) — tek Sportmonks isteği `fixtures/{id}?include=comments:…;lineups:…;participants;formations` (Fixture
 * havuzu; kadro temsili sahne için), paylaşımlı cache'ten (bkz. cachePolicy: canlı 60 sn, yeni biten 15 dk, 1 günden eski bitmiş maç 7 gün). Maç
 * SSR'ına girmez; sekme açılınca istemciden istenir. Havuz rezervinde (Fixture kalan < %30) yalnız önbellek — ıska = geçici
 * hata (istemci "yüklenemedi · tekrar dene" gösterir), kalan kota canlı uçlara ve maç sayfalarına.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import { mapSportmonksStateToPhase, type MatchPhaseBucket } from '@/services/sportmonks/stateMapping';
import {
  COMMENTARY_FIXTURE_SELECT,
  COMMENTARY_INCLUDE,
  normalizeCommentary,
  type CommentaryItem,
  type RawComment,
} from '@/services/sportmonks/matchCommentary';
import {
  buildSceneSquads,
  resolveSceneSides,
  SCENE_INCLUDE,
  type RawFormation,
  type RawLineupRow,
  type RawParticipant,
  type SceneSquads,
} from '@/services/sportmonks/commentaryScene';
import { withSportmonksCacheOnly } from '@/server/sportmonks/cachedFetch';
import { isPoolInReserve, poolForPath } from '@/server/sportmonks/poolGuard';

export type MatchCommentary = {
  items: CommentaryItem[];
  /** Temsili sahne için iki kadro (aynı istekteki lineups/participants); yoksa null → sahne varsayılan 4-4-2. */
  squads: SceneSquads | null;
  /** Canlı (ilk yarı, devre arası, ikinci yarı, uzatma…) → istemci periyodik yeniler. */
  live: boolean;
  phase: MatchPhaseBucket;
  /** Başlama (unix sn) — uç CDN süresini buna göre seçer. */
  kickoff: number | null;
};

type RawFixture = {
  state_id?: number | null;
  starting_at_timestamp?: number | null;
  comments?: RawComment[] | null;
  lineups?: RawLineupRow[] | null;
  participants?: RawParticipant[] | null;
  formations?: RawFormation[] | null;
};

/** Maç yoksa null; Sportmonks/önbellek geçici hatasında fırlatır (hata ≠ veri yok). */
export async function loadMatchCommentary(fixtureId: number, now: number = Date.now()): Promise<MatchCommentary | null> {
  const load = () =>
    sportmonksClientRequest<RawFixture>('football', `/fixtures/${fixtureId}`, {
      select: COMMENTARY_FIXTURE_SELECT,
      include: `${COMMENTARY_INCLUDE};${SCENE_INCLUDE}`,
    });
  let raw: RawFixture | null;
  try {
    const reserve = await isPoolInReserve(poolForPath('football/fixtures'), now).catch(() => false);
    const envelope = reserve ? await withSportmonksCacheOnly({ misses: 0 }, load) : await load();
    raw = envelope.data && !Array.isArray(envelope.data) ? envelope.data : null;
  } catch (e) {
    if (e instanceof SportmonksHttpError && e.status === 404) return null;
    throw e;
  }
  if (!raw) return null;
  const phase = typeof raw.state_id === 'number' ? mapSportmonksStateToPhase(raw.state_id) : 'NOT STARTED';
  const squads = buildSceneSquads(raw.lineups, raw.participants, raw.formations);
  return {
    items: resolveSceneSides(normalizeCommentary(raw.comments), squads),
    squads,
    live: phase === 'IN PLAY' || phase === 'HALF TIME BREAK',
    phase,
    kickoff: typeof raw.starting_at_timestamp === 'number' ? raw.starting_at_timestamp : null,
  };
}
