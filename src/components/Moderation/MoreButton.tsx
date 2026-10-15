import { useCallback, useRef, useState, type ComponentType } from 'react';
import type { ModerationMenuProps } from './ModerationMenu';
import styles from './moreButton.module.scss';

type Props = Omit<ModerationMenuProps, 'open' | 'onClose' | 'anchorRef'> & { label: string; size?: 'md' | 'sm' };

let menuModule: Promise<ComponentType<ModerationMenuProps>> | null = null;
function loadMenu() {
  menuModule ??= import('./ModerationMenu').then((m) => m.default).catch((e) => {
    menuModule = null;
    throw e;
  });
  return menuModule;
}

/**
 * "⋯" düğmesi (gönderi / yorum / profil). Menü, şikâyet formu, engelleme ve çevirileri İLK TIKTA yüklenir (yerel
 * import()): ana sayfa akışının ilk yükü büyümez. Düğme 32×32 px (WCAG 2.2 hedef ≥ 24 px).
 */
export default function MoreButton({ label, size = 'md', ...menuProps }: Props) {
  const [Menu, setMenu] = useState<ComponentType<ModerationMenuProps> | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  function toggle() {
    if (Menu) {
      setOpen((o) => !o);
      return;
    }
    void loadMenu().then((C) => {
      setMenu(() => C);
      setOpen(true);
    });
  }

  return (
    <span className={styles.wrap}>
      <button
        ref={ref}
        type="button"
        className={`${styles.button} ${size === 'sm' ? styles.sm : ''}`.trim()}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="5" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="19" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {Menu ? <Menu {...menuProps} open={open} onClose={close} anchorRef={ref} /> : null}
    </span>
  );
}
