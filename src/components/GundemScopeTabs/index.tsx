import { useTranslation } from '@/lib/i18n';
import type { GundemScope } from '@/types/gundem';
import styles from './gundemScopeTabs.module.scss';

/** Akış sekmelerinin sırası — Gündem sayfası ve ana sayfa paneli aynı listeyi kullanır. */
export const GUNDEM_SCOPES: GundemScope[] = ['all', 'following', 'official', 'match'];

export function readGundemScope(raw: string | string[] | undefined): GundemScope {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return GUNDEM_SCOPES.includes(s as GundemScope) ? (s as GundemScope) : 'all';
}

export type GundemScopeTabsProps = {
  value: GundemScope;
  onChange: (scope: GundemScope) => void;
  /** Oturumsuzken "Takip" sekmesi gizlenir. */
  hideFollowing?: boolean;
  /** Dar paneller (ana sayfa): daha küçük çipler + kısa etiketler. */
  compact?: boolean;
};

/** Tümü | Takip | Resmi | Maçlar */
export default function GundemScopeTabs({ value, onChange, hideFollowing = false, compact = false }: GundemScopeTabsProps) {
  const { t } = useTranslation('gundem');
  const tabs = hideFollowing ? GUNDEM_SCOPES.filter((s) => s !== 'following') : GUNDEM_SCOPES;
  return (
    <div className={`${styles.tabs} ${compact ? styles.compact : ''}`.trim()} role="tablist" aria-label={t('tabs.label')}>
      {tabs.map((s) => (
        <button
          key={s}
          type="button"
          role="tab"
          aria-selected={value === s}
          className={`${styles.tab} ${value === s ? styles.tabActive : ''}`.trim()}
          onClick={() => onChange(s)}
        >
          {t(compact ? `tabs.short.${s}` : `tabs.${s}`)}
        </button>
      ))}
    </div>
  );
}
