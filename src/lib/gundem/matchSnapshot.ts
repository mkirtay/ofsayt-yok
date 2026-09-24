import type { MatchSnapshot } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/logger';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { SportmonksHttpError } from '@/services/sportmonks/httpClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';

/** Snapshot bu süreden eskiyse ve maç hâlâ "yenilenebilir" penceredeyse arka planda yeniden çekilir (erteleme/saat değişikliği). */
export const SNAPSHOT_REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;
/** Başlama saatinden bu kadar sonrasına kadar yenilemeye izin verilir: başlama anında açıklanan ertelemeler de yakalanır. */
export const SNAPSHOT_REFRESH_GRACE_MS = 3 * 60 * 60 * 1000;

const FIXTURE_ID_RE = /^\d{1,12}$/;

export type MatchSnapshotErrorReason = 'invalid-id' | 'not-found' | 'upstream';

/** `invalid-id`/`not-found` → istemci hatası (400); `upstream` → sağlayıcıya ulaşılamadı (503, tekrar denenebilir). */
export class MatchSnapshotError extends Error {
  constructor(readonly reason: MatchSnapshotErrorReason, message: string) {
    super(message);
    this.name = 'MatchSnapshotError';
  }
}

export type FetchFixture = (fixtureId: string) => Promise<SportmonksFixture | null>;

export type SnapshotDeps = {
  fetchFixture?: FetchFixture;
  now?: () => Date;
};

/** Maliyet: 1 Sportmonks isteği (`/fixtures/{id}?include=participants`). 404 → null. */
const defaultFetchFixture: FetchFixture = async (fixtureId) => {
  try {
    const envelope = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${fixtureId}`, {
      include: 'participants',
    });
    return envelope.data ?? null;
  } catch (e) {
    if (e instanceof SportmonksHttpError && e.status === 404) return null;
    throw e;
  }
};

/** İstek gövdesindeki `matchId`'yi (string ya da sayı) normalize eder; yoksa null, biçim bozuksa `invalid-id`. */
export function normalizeFixtureId(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const s = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!FIXTURE_ID_RE.test(s)) throw new MatchSnapshotError('invalid-id', 'Geçersiz maç.');
  return s;
}

/** Sportmonks `starting_at` ("YYYY-MM-DD HH:mm:ss", UTC) → Date; bozuksa null. */
export function parseStartingAt(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(`${value.trim().replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fixture → snapshot alanları. Ev/deplasman katılımcısı ya da başlama saati yoksa null (rozet üretilemez). */
export function fixtureToSnapshotData(fixture: SportmonksFixture) {
  const participants = fixture.participants ?? [];
  const home = participants.find((p) => p.meta?.location === 'home');
  const away = participants.find((p) => p.meta?.location === 'away');
  const startingAt = parseStartingAt(fixture.starting_at);
  if (!home || !away || !startingAt) return null;
  return {
    homeTeamId: home.id,
    homeName: home.name,
    homeShortName: home.short_code?.trim() || null,
    homeLogo: home.image_path ?? null,
    awayTeamId: away.id,
    awayName: away.name,
    awayShortName: away.short_code?.trim() || null,
    awayLogo: away.image_path ?? null,
    startingAt,
    leagueId: fixture.league_id ?? null,
  };
}

/**
 * Yenileme kuralı: snapshot `SNAPSHOT_REFRESH_AFTER_MS`'den eski VE maç henüz başlamamış (ya da başlama saatinin üzerinden
 * `SNAPSHOT_REFRESH_GRACE_MS` geçmemiş). Bitmiş maçların snapshot'ı bir daha çekilmez.
 */
export function isSnapshotStale(snap: Pick<MatchSnapshot, 'updatedAt' | 'startingAt'>, now: Date): boolean {
  const t = now.getTime();
  return t - snap.updatedAt.getTime() > SNAPSHOT_REFRESH_AFTER_MS && t < snap.startingAt.getTime() + SNAPSHOT_REFRESH_GRACE_MS;
}

async function fetchAndUpsert(fixtureId: string, fetchFixture: FetchFixture): Promise<MatchSnapshot> {
  let fixture: SportmonksFixture | null;
  try {
    fixture = await fetchFixture(fixtureId);
  } catch (e) {
    captureError('gundem:match-snapshot', e);
    throw new MatchSnapshotError('upstream', 'Maç bilgisi şu an doğrulanamadı. Biraz sonra tekrar deneyin.');
  }
  const data = fixture && String(fixture.id) === fixtureId ? fixtureToSnapshotData(fixture) : null;
  if (!data) throw new MatchSnapshotError('not-found', 'Maç bulunamadı.');
  return prisma.matchSnapshot.upsert({
    where: { fixtureId },
    create: { fixtureId, ...data },
    update: data,
  });
}

/** Aynı süreçte aynı maç için eşzamanlı yenilemeleri tekilleştirir. */
const inflightRefresh = new Map<string, Promise<unknown>>();

/**
 * Sağlayıcıdan yeniden çekip upsert eder (hata yutulur, loglanır). Sunucusuz ortamda yanıt döndükten sonra süreç
 * dondurulabilir → "best effort"; tamamlanmazsa bir sonraki `ensureMatchSnapshot` çağrısı yeniden dener.
 */
export function refreshMatchSnapshotInBackground(fixtureId: string, deps: SnapshotDeps = {}): Promise<unknown> {
  const running = inflightRefresh.get(fixtureId);
  if (running) return running;
  const p = fetchAndUpsert(fixtureId, deps.fetchFixture ?? defaultFetchFixture)
    .catch((e) => {
      if (!(e instanceof MatchSnapshotError)) captureError('gundem:match-snapshot-refresh', e);
    })
    .finally(() => inflightRefresh.delete(fixtureId));
  inflightRefresh.set(fixtureId, p);
  return p;
}

/**
 * Maç rozet verisini garanti eder: DB'de varsa onu döndürür (0 istek; eskiyse arka planda yeniler), yoksa
 * `/fixtures/{id}?include=participants` ile çözüp upsert eder (1 istek). Çözülemezse `MatchSnapshotError` fırlatır.
 */
export async function ensureMatchSnapshot(fixtureIdInput: string, deps: SnapshotDeps = {}): Promise<MatchSnapshot> {
  const fixtureId = normalizeFixtureId(fixtureIdInput);
  if (!fixtureId) throw new MatchSnapshotError('invalid-id', 'Geçersiz maç.');
  const existing = await prisma.matchSnapshot.findUnique({ where: { fixtureId } });
  if (existing) {
    if (isSnapshotStale(existing, (deps.now ?? (() => new Date()))())) void refreshMatchSnapshotInBackground(fixtureId, deps);
    return existing;
  }
  return fetchAndUpsert(fixtureId, deps.fetchFixture ?? defaultFetchFixture);
}
