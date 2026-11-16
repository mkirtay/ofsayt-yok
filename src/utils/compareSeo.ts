/**
 * Karşılaştırma sayfası (/compare/{a}-vs-{b}) sunucu metni (SEO raporu 2026-11-16: "[A] [B] aralarındaki maçlar").
 * Veri yalnız önbellekten (sayfa yeni Sportmonks isteği atmaz); yoksa yalnız takım adlarıyla başlık.
 */
import type { H2HSummary } from '@/utils/compareData';

export type CompareSeo = {
  team1: string;
  team2: string;
  summary: H2HSummary | null;
};

const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' });

export function compareHeading(s: Pick<CompareSeo, 'team1' | 'team2'>): string {
  return `${s.team1} - ${s.team2}: Aralarındaki Maçlar ve Karşılaştırma`;
}

export function buildCompareSentences(s: CompareSeo): string[] {
  const h = s.summary;
  if (!h || h.total === 0) return [];
  const out = [
    `${s.team1} ile ${s.team2} arasındaki son ${h.total} maçta ${s.team1} ${h.team1Wins}, ${s.team2} ${h.team2Wins} kez kazandı; ${h.draws} maç berabere bitti.`,
  ];
  const last = h.rows[0];
  if (last) {
    const when = last.date && /^\d{4}-\d{2}-\d{2}/.test(last.date) ? `${dateFmt.format(new Date(`${last.date.slice(0, 10)}T12:00:00Z`))} tarihindeki ` : '';
    out.push(`Son karşılaşma: ${when}${last.homeName} ${last.score} ${last.awayName}.`);
  }
  return out;
}
