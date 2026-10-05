import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './matchTabs.module.scss';

export type MatchTabItem<K extends string = string> = {
  key: K;
  label: string;
  /** Başlıkta amber premium noktası (AI üretimi gerektiren sekmeler). */
  premium?: boolean;
  /** Panel içeriği — yalnızca sekme ilk kez açıldığında çağrılır (lazy mount). */
  render: () => ReactNode;
};

type Props<K extends string> = {
  tabs: readonly MatchTabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  /** `role="tablist"` için erişilebilir ad. */
  ariaLabel: string;
  /**
   * Açılmamış olsa da ilk HTML'de (gizli) çizilecek sekmeler — ör. AI analizi ücretsiz önizlemesi arama motorları
   * için sunucu HTML'inde olsun (kredi modeli v2). Panel `hidden`; görünür düzen değişmez.
   */
  prerender?: readonly K[];
};

/** Ziyaret edilen sekmeler (panelleri mount edilir); zaten varsa aynı dizi döner. */
export function markVisited<K extends string>(visited: readonly K[], key: K): readonly K[] {
  return visited.includes(key) ? visited : [...visited, key];
}

/**
 * Maç detayının DÜZ (tek seviyeli) sekme şeridi — iç içe alt-sekme yok.
 * Bir sekme açıldıktan sonra paneli DOM'da kalır (yalnızca `hidden`), böylece
 * sekme değişince devam eden AI analiz üretimi / yazılmakta olan yorum kaybolmaz;
 * hiç açılmamış sekme ise mount edilmez (gereksiz analiz/trivia isteği yok).
 * Paneller kendi kart çerçevelerini korur — şerit sadece başlıkları çizer.
 */
export default function MatchTabs<K extends string>({ tabs, active, onChange, ariaLabel, prerender = [] }: Props<K>) {
  const uid = useId();
  const [visited, setVisited] = useState<readonly K[]>(() => [active, ...prerender.filter((k) => k !== active)]);
  // Sekme DIŞARIDAN seçildiyse (derin bağlantı: `?sekme=ai-analiz`) paneli de mount et — yoksa başlık seçili görünür
  // ama içerik çizilmezdi (hiç açılmamış ve prerender edilmemiş sekme).
  if (!visited.includes(active)) setVisited(markVisited(visited, active));

  const select = (key: K) => {
    setVisited((prev) => markVisited(prev, key));
    onChange(key);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    select(tabs[next].key);
    document.getElementById(`${uid}-tab-${tabs[next].key}`)?.focus();
  };

  return (
    <>
      <div className={styles.tabList} role="tablist" aria-label={ariaLabel}>
        {tabs.map(({ key, label, premium }, i) => (
          <button
            key={key}
            id={`${uid}-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={active === key}
            aria-controls={`${uid}-panel-${key}`}
            tabIndex={active === key ? 0 : -1}
            className={`${styles.tab} ${active === key ? styles.tabActive : ''}`.trim()}
            onClick={() => select(key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {label}
            {premium ? <span className={styles.premiumDot} aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      {tabs
        .filter(({ key }) => visited.includes(key) || key === active)
        .map(({ key, render }) => (
          <div
            key={key}
            id={`${uid}-panel-${key}`}
            role="tabpanel"
            aria-labelledby={`${uid}-tab-${key}`}
            hidden={active !== key}
            className={styles.panel}
          >
            {render()}
          </div>
        ))}
    </>
  );
}
