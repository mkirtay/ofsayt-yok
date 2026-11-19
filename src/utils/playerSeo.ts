/**
 * Oyuncu sayfası sunucu metni (SEO raporu 2026-11-16: "[isim] istatistikleri"): tek, alıntılanabilir paragraf.
 * Kaynak: oyuncu profili (Player havuzu, tek istek). Mevki, uyruk ve (eşlemesi olan) lig adı Türkçe.
 */
import type { PlayerProfile } from '@/services/playerProfile';
import { STAT, statMain } from '@/services/sportmonks/playerStatTypes';
import { countryDisplayName } from '@/utils/countryName';
import { leagueDisplayName } from '@/lib/gundem/bot/leagueNames';

const POSITION_TR: Record<string, string> = {
  Goalkeeper: 'kaleci',
  Defender: 'defans oyuncusu',
  Midfielder: 'orta saha oyuncusu',
  Attacker: 'forvet',
};

export type PlayerSeo = { name: string; teamName: string | null; position: string | null; nationality: string | null; sentences: string[] };

function age(dob: string | undefined, now: number): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob)) return null;
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  const n = new Date(now);
  let a = n.getUTCFullYear() - d.getUTCFullYear();
  if (n.getUTCMonth() < d.getUTCMonth() || (n.getUTCMonth() === d.getUTCMonth() && n.getUTCDate() < d.getUTCDate())) a -= 1;
  return a > 10 && a < 60 ? a : null;
}

export function buildPlayerSeo(p: PlayerProfile, now: number = Date.now()): PlayerSeo {
  const pos = p.position ? (POSITION_TR[p.position] ?? null) : null;
  const team = p.currentTeam?.name ?? null;
  const a = age(p.dateOfBirth, now);
  const nat = p.nationality?.name ? countryDisplayName({ name: p.nationality.name, iso2: p.nationality.iso2 }, 'tr') : null;
  const sentences: string[] = [];
  // Güncel takımı yoksa (emekli / kulüpsüz) "oynuyor" denmez; yalnız mevki.
  const facts = team
    ? [`${team} takımında`, pos ? `${pos} olarak oynuyor` : 'oynuyor'].join(' ')
    : (pos ?? '');
  if (facts) sentences.push(`${p.name}, ${facts}${a ? ` (${a} yaşında` : ''}${a && nat ? `, ${nat}` : !a && nat ? ` (${nat}` : ''}${a || nat ? ')' : ''}.`);
  const league = p.seasons.find((s) => !s.isCup && (statMain(s.stats[STAT.APPEARANCES]) ?? 0) > 0);
  if (league) {
    const apps = statMain(league.stats[STAT.APPEARANCES]) ?? 0;
    const goals = statMain(league.stats[STAT.GOALS]) ?? 0;
    const assists = statMain(league.stats[STAT.ASSISTS]) ?? 0;
    const leagueLabel = leagueDisplayName(league.leagueId, league.leagueName);
    sentences.push(
      `${league.seasonName}${leagueLabel ? ` ${leagueLabel}` : ''} sezonunda ${apps} maçta ${goals} gol${assists ? ` ve ${assists} asist` : ''} kaydetti.`,
    );
  }
  return { name: p.name, teamName: team, position: pos, nationality: nat, sentences };
}
