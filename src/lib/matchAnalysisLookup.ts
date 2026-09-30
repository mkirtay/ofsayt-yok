import type { MatchAnalysis } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Kayıtlı analizi YALNIZCA maçın kendi id'siyle bulur.
 *
 * Eskiden id ile bulunamazsa aynı iki takımın en son analizine düşülüyordu (eski sağlayıcıda maç id'leri
 * değişebildiği için). Sportmonks id'leri kalıcı; o yedek aynı eşleşmenin ESKİ maçının analizini yeni
 * maça "zaten var" diye döndürüyordu (ör. geçen sezonun derbisi → bu sezonun derbisi). Kaldırıldı.
 */
export async function findStoredMatchAnalysis(matchId: string, matchStatus: string): Promise<MatchAnalysis | null> {
  return prisma.matchAnalysis.findUnique({
    where: { matchId_matchStatus: { matchId, matchStatus } },
  });
}
