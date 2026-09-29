import { prisma } from '@/lib/prisma';

/** Saklı içerik (analiz/trivia) olan bir maç; takım adları yalnızca analiz kaydında var. */
export type StoredMatchInfo = { homeTeamName: string | null; awayTeamName: string | null };

/**
 * matchId için saklı içerik varsa takım adlarıyla döner, yoksa `null`.
 * Takım adları URL slug'ını doğrulamak için: aynı id'li başka bir maçın (ör. eski UEFA H2H linki)
 * sayfasını eski bir analiz ele geçirmesin (bkz. /matches/[slug] SSR).
 */
export async function findStoredMatchInfo(matchId: string): Promise<StoredMatchInfo | null> {
  const analysis = await prisma.matchAnalysis.findFirst({
    where: { matchId },
    select: { homeTeamName: true, awayTeamName: true },
    orderBy: { createdAt: 'desc' },
  });
  if (analysis) {
    return { homeTeamName: analysis.homeTeamName || null, awayTeamName: analysis.awayTeamName || null };
  }
  const trivia = await prisma.matchTrivia.findFirst({ where: { matchId }, select: { id: true } });
  return trivia ? { homeTeamName: null, awayTeamName: null } : null;
}
