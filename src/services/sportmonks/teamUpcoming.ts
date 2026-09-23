/**
 * Takım fikstürü (yaklaşan maçlar) — `GET /football/teams/{id}?include=upcoming.participants;upcoming.league;upcoming.state`.
 *
 * Neden bu endpoint (2026-09-24'te Galatasaray id=34 ile gerçek istekle doğrulandı):
 *  - TEK istek, `Team` kota havuzundan sayılır (fixture çağrılarının yoğun kullandığı `Fixture` havuzundan değil).
 *  - Takımın TÜM turnuvalardaki (lig + kupa + UEFA) oynanmamış maçlarını sezon sonuna kadar döndürür
 *    (GS: 35 maç, Süper Lig + Şampiyonlar Ligi). `fixtures/between/{from}/{to}/{teamId}` ise 100 günle
 *    sınırlı — sezonun tamamı için 3+ parçalı istek gerekirdi.
 *  - Yanıt takımın kendi adını/logosunu da taşır (son maçı olmayan takımda başlık için yedek).
 *
 * Mobil uygulama da birebir aynı isteği kullanır; include'lar değişirse iki tarafta birlikte değişmeli.
 */
import type { Match } from '@/models/liveScore';
import { mapSportmonksFixtureToMatch } from '../sportmonksFixtureMapper';
import type { SportmonksFixture } from './types';

export const TEAM_UPCOMING_INCLUDE = 'upcoming.participants;upcoming.league;upcoming.state';

/** Proxy (Redis) cache süresi ve istemci `staleTime` — bkz. statsCache.ts. */
export const TEAM_UPCOMING_CACHE_TTL_SECONDS = 10 * 60;

export type SportmonksTeamWithUpcoming = {
  id: number;
  name?: string;
  image_path?: string | null;
  upcoming?: SportmonksFixture[] | null;
};

export type TeamUpcoming = {
  team: { id: number; name: string; logo?: string } | null;
  /** Oynanmamış maçlar, en yakından uzağa. */
  fixtures: Match[];
};

/**
 * Sportmonks saati açıklanmamış maçları `00:00:00` UTC ile yer tutar (ör. GS'nin Ocak sonrası lig maçları).
 * Gerçek 00:00 UTC başlama saatleri de var (Amerika kıtası akşam maçları) — onları ayırmak için
 * `has_odds` bakılır: saati kesinleşmiş yakın maçların oranı açılmış olur, yer tutucu tarihlerin olmaz.
 */
export function isKickoffTimeTbd(fixture: Pick<SportmonksFixture, 'starting_at' | 'has_odds'>): boolean {
  const time = fixture.starting_at?.trim().split(' ')[1] ?? '';
  return time.startsWith('00:00') && fixture.has_odds !== true;
}

function sortKey(m: Match): string {
  return `${m.date ?? ''} ${m.scheduled ?? ''}`;
}

/** `upcoming` include'u → oynanmamış (`NOT STARTED` kovası) maçlar; id'ye göre tekil, en yakından uzağa sıralı. */
export function mapTeamUpcomingFixtures(fixtures: SportmonksFixture[] | null | undefined): Match[] {
  const seen = new Set<number>();
  const out: Match[] = [];
  for (const fx of fixtures ?? []) {
    if (seen.has(fx.id)) continue;
    seen.add(fx.id);
    const match = mapSportmonksFixtureToMatch(fx);
    if (match.status !== 'NOT STARTED') continue;
    out.push(isKickoffTimeTbd(fx) ? { ...match, time_tbd: true } : match);
  }
  return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

export function mapTeamUpcoming(team: SportmonksTeamWithUpcoming | null | undefined): TeamUpcoming {
  if (!team) return { team: null, fixtures: [] };
  return {
    team: {
      id: team.id,
      name: team.name ?? '',
      ...(team.image_path ? { logo: team.image_path } : {}),
    },
    fixtures: mapTeamUpcomingFixtures(team.upcoming),
  };
}
