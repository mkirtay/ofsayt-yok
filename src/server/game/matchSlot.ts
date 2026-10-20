/**
 * Maç sayfası "Bu maç {{game}}'nde" kartı: maç bu haftanın / bugünün yayındaki listesinde ve başlamamışsa SSR'da tek indeksli
 * sorgu (GameMatch.fixtureId tekil). Yalnız oyun HERKESE AÇIKKEN (`public`): sayfa CDN'de herkese aynı → önizleme modunda kart
 * çizilmez (yetkisiz ziyaretçiye oyun sızmasın). Hata → null (sayfa yine çizilir). Kişisel tahmin istemcide.
 */
import { gameMode } from '@/config/gameFlag';
import { prisma } from '@/lib/prisma';

export type GameSlot = {
  gameMatchId: string;
  weekKey: string | null;
  dayKey: string | null;
  /** UTC ISO; kilit bu anda (gösterim). */
  kickoffAt: string;
};

export async function loadGameSlotForFixture(fixtureId: string, now: Date = new Date()): Promise<GameSlot | null> {
  if (gameMode() !== 'public') return null;
  try {
    const m = await prisma.gameMatch.findUnique({
      where: { fixtureId },
      select: { id: true, kickoffAt: true, status: true, week: { select: { weekKey: true, status: true } }, day: { select: { dayKey: true, status: true } } },
    });
    if (!m || m.status !== 'SCHEDULED' || m.kickoffAt <= now) return null;
    const weekKey = m.week?.status === 'PUBLISHED' ? m.week.weekKey : null;
    const dayKey = m.day?.status === 'PUBLISHED' ? m.day.dayKey : null;
    if (!weekKey && !dayKey) return null;
    return { gameMatchId: m.id, weekKey, dayKey, kickoffAt: m.kickoffAt.toISOString() };
  } catch {
    return null;
  }
}
