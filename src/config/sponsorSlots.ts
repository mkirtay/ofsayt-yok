/**
 * Sponsor satırları (büyüme raporu 3.5): "Haftanın hakem raporu" ve tahmin oyunu isim sponsorluğu. Slot boşken (null)
 * hiçbir şey çizilmez. Kural: bahis / kumar markası YOK; tahmin oyununa sponsor ÖDÜLÜ (para, ürün) eklenmez — ödüllü
 * yarışma mevzuatı (hukuki görüş gerekir). Bağlantı rel="sponsored". (Logo şeridi ayrı: config/sponsors.ts.)
 */
export type SlotSponsor = { name: string; url: string; /** Görünen ek, ör. "katkılarıyla" */ label?: string };
export type SponsorSlot = 'refereeReport' | 'predictionLeague';

export const SPONSOR_SLOTS: Record<SponsorSlot, SlotSponsor | null> = {
  refereeReport: null,
  predictionLeague: null,
};
