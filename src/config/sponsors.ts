export type Sponsor = {
  id: string;
  name: string;
  /** Logo URL'si (yoksa isim metni gösterilir — placeholder). */
  logo?: string;
  href?: string;
  /** Yer tutucu — gerçek anlaşmalı sponsor eklenince false/yok olur. */
  placeholder?: boolean;
};

/** Kullanıcının kendi anlaştığı sponsorlar. Şimdilik yer tutucu; gerçek marka eklenince burası doldurulur. */
export const SPONSORS: Sponsor[] = [
  { id: 'placeholder-1', name: 'Sponsor 1', placeholder: true },
  { id: 'placeholder-2', name: 'Sponsor 2', placeholder: true },
  { id: 'placeholder-3', name: 'Sponsor 3', placeholder: true },
  { id: 'placeholder-4', name: 'Sponsor 4', placeholder: true },
];
