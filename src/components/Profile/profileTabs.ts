import type { ComponentType } from 'react';
import type { ProfileDto } from '@/hooks/useProfile';
import InfoTab from './InfoTab';
import FavoritesTab from './FavoritesTab';
import CreditHistoryTab from './CreditHistoryTab';
import AnalysesTab from './AnalysesTab';

export type ProfileTabProps = { profile: ProfileDto };

export type ProfileTabDef = {
  /** URL'de `?tab=<id>` olarak kullanılır. */
  id: string;
  /** `profile` çeviri ad alanında sekme etiketi anahtarı. */
  labelKey: string;
  Component: ComponentType<ProfileTabProps>;
};

/**
 * Profil sekmeleri — SIRA = görünüm sırası. Yeni sekme (ör. ileride "Gönderilerim": topluluk/post özelliği geldiğinde)
 * eklemek için buraya TEK bir satır + bir bileşen yeterli; sayfa kabuğu, chip'ler, `?tab=` derin bağlantı ve
 * erişilebilirlik otomatik gelir.
 */
export const PROFILE_TABS: ProfileTabDef[] = [
  { id: 'info', labelKey: 'tabs.info', Component: InfoTab },
  { id: 'favorites', labelKey: 'tabs.favorites', Component: FavoritesTab },
  { id: 'credits', labelKey: 'tabs.credits', Component: CreditHistoryTab },
  { id: 'analyses', labelKey: 'tabs.analyses', Component: AnalysesTab },
];

export const DEFAULT_PROFILE_TAB = PROFILE_TABS[0].id;

export function resolveProfileTab(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return PROFILE_TABS.some((t) => t.id === v) ? (v as string) : DEFAULT_PROFILE_TAB;
}
