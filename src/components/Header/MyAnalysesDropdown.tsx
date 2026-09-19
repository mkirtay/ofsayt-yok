import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import MyAnalysesList from './MyAnalysesList';
import styles from './header.module.scss';

/** Mobil menüde kullanılan bağımsız "AI Analizlerim" açılır listesi (masaüstünde `AiMenu` içine gömülü). */
export default function MyAnalysesDropdown() {
  const { t } = useTranslation('nav');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className={styles.myAnalysesWrap} ref={wrapRef}>
      <button type="button" className={styles.headerNavPill} onClick={() => setOpen((o) => !o)}>
        {t('myAnalyses')}
      </button>
      {open && (
        <div className={styles.myAnalysesDropdown}>
          <MyAnalysesList />
        </div>
      )}
    </div>
  );
}
