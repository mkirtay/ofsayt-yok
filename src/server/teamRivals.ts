/**
 * Derbi tespiti: Sportmonks takım `rivals` listesi (`GET /teams/{id}?include=rivals:id`, 2026-10-04 doğrulandı:
 * Galatasaray → Beşiktaş, Fenerbahçe; Kasımpaşa → boş). Takım başına tek istek, paylaşımlı cache'te 24 sa
 * (cachePolicy `teams` + `rivals`); bir takımın bütün maçları paylaşır.
 */
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';

type RawTeamWithRivals = { id?: number; rivals?: { id?: number }[] | null };

/** `null` = okunamadı (geçici hata) — "rakibi yok" ile karışmasın. */
export async function loadTeamRivalIds(teamId: number): Promise<number[] | null> {
  if (!Number.isInteger(teamId) || teamId <= 0) return [];
  try {
    const envelope = await sportmonksClientRequest<RawTeamWithRivals>('football', `/teams/${teamId}`, { include: 'rivals:id' });
    const team = envelope.data;
    if (!team || Array.isArray(team)) return [];
    return (team.rivals ?? []).map((r) => r.id).filter((id): id is number => typeof id === 'number');
  } catch {
    return null;
  }
}

/**
 * İki takım derbi mi: biri diğerini rakip olarak listeliyorsa (Sportmonks listeleri her zaman karşılıklı değil —
 * kulübün kendi listesi boş olabiliyor; tek yön yeterli sayıldı).
 */
export function isDerbyPair(homeId: number, awayId: number, homeRivals: readonly number[], awayRivals: readonly number[]): boolean {
  return homeRivals.includes(awayId) || awayRivals.includes(homeId);
}

/** `null` = takımlardan birinin listesi okunamadı (sonuç cache'lenmemeli). */
export async function loadIsDerby(homeId: number, awayId: number): Promise<boolean | null> {
  if (homeId === awayId) return false;
  const [h, a] = await Promise.all([loadTeamRivalIds(homeId), loadTeamRivalIds(awayId)]);
  if (h == null || a == null) return null;
  return isDerbyPair(homeId, awayId, h, a);
}
