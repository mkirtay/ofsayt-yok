import { useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueFilterMode, LeagueFilterState, PickedLeague, CatalogLeague } from '@/utils/leagueFilter';
import { searchLeagues } from '@/utils/leagueFilter';
import { useTranslation } from '@/lib/i18n';
import LeagueLogo from '@/components/LeagueLogo';
import styles from './leagueFilterBar.module.scss';

type BarProps = {
  state: LeagueFilterState;
  catalog: CatalogLeague[];
  onSelectMode: (mode: LeagueFilterMode) => void;
  onApplyCustom: (picked: PickedLeague[]) => void;
};

/**
 * Kalıcı lig filtresi chip satırı: Tümü | Süper Lig | 5 Büyük Lig | Liglerim (n) | + Ligler.
 * "Liglerim" yalnızca kayıtlı özel seçim varken görünür. ("Favoriler" sekmesi favori MAÇLARdır — karıştırma.)
 */
export default function LeagueFilterBar({ state, catalog, onSelectMode, onApplyCustom }: BarProps) {
  const { t } = useTranslation('match');
  const [pickerOpen, setPickerOpen] = useState(false);

  const chips: { mode: LeagueFilterMode; label: string }[] = [
    { mode: 'all', label: t('leagueFilter.all') },
    { mode: 'super', label: t('leagueFilter.super') },
    { mode: 'big5', label: t('leagueFilter.big5') },
    ...(state.custom.length ? [{ mode: 'custom' as const, label: t('leagueFilter.mine', { count: state.custom.length }) }] : []),
  ];

  return (
    <>
      <div className={styles.bar} role="group" aria-label={t('leagueFilter.group')}>
        {chips.map((c) => (
          <button
            key={c.mode}
            type="button"
            className={`${styles.chip} ${state.mode === c.mode ? styles.chipActive : ''}`.trim()}
            aria-pressed={state.mode === c.mode}
            onClick={() => onSelectMode(c.mode)}
          >
            {c.label}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.chip} ${styles.chipAdd}`}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(true)}
        >
          <span aria-hidden="true">＋</span> {t('leagueFilter.add')}
        </button>
      </div>

      {pickerOpen ? (
        <LeaguePickerDialog
          catalog={catalog}
          initial={state.custom}
          onClose={() => setPickerOpen(false)}
          onApply={(picked) => {
            onApplyCustom(picked);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

type DialogProps = {
  catalog: CatalogLeague[];
  initial: PickedLeague[];
  onClose: () => void;
  onApply: (picked: PickedLeague[]) => void;
};

/** Modal (masaüstü) / bottom-sheet (mobil) — toolbar'a gömülü dropdown DEĞİL, ayrı overlay katmanı. */
export function LeaguePickerDialog({ catalog, initial, onClose, onApply }: DialogProps) {
  const { t } = useTranslation('match');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<number, string>>(() => new Map(initial.map((p) => [p.id, p.name])));
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => searchLeagues(catalog, query), [catalog, query]);

  useEffect(() => {
    searchRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // arka sayfa kaymasın
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && dialogRef.current) {
        // Odak tuzağı: Tab dialog dışına çıkmasın
        const f = dialogRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggle = (l: CatalogLeague) =>
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(l.id)) next.delete(l.id);
      else next.set(l.id, l.name);
      return next;
    });

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="league-picker-title">
        <header className={styles.dialogHead}>
          <h2 id="league-picker-title" className={styles.dialogTitle}>
            {t('leagueFilter.pickTitle')}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('leagueFilter.close')}>
            ✕
          </button>
        </header>

        <div className={styles.searchWrap}>
          <input
            ref={searchRef}
            type="search"
            className={styles.search}
            placeholder={t('leagueFilter.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('leagueFilter.searchLabel')}
          />
        </div>

        <ul className={styles.list}>
          {visible.length === 0 ? (
            <li className={styles.noResult}>{t('leagueFilter.noResult')}</li>
          ) : (
            visible.map((l) => (
              <li key={l.id}>
                <label className={styles.row}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.has(l.id)}
                    onChange={() => toggle(l)}
                  />
                  <LeagueLogo src={l.logo} size={20} className={styles.rowLogo} />
                  <span className={styles.rowName}>{l.name}</span>
                  {l.country ? <span className={styles.rowSub}>{l.country}</span> : null}
                </label>
              </li>
            ))
          )}
        </ul>

        <footer className={styles.dialogFoot}>
          <button type="button" className={styles.clear} onClick={() => setSelected(new Map())} disabled={selected.size === 0}>
            {t('leagueFilter.clear')}
          </button>
          <button
            type="button"
            className={styles.apply}
            onClick={() => onApply([...selected].map(([id, name]) => ({ id, name })))}
          >
            {selected.size ? t('leagueFilter.applyCount', { count: selected.size }) : t('leagueFilter.apply')}
          </button>
        </footer>
      </div>
    </div>
  );
}
