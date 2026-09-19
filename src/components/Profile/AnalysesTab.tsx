import { useTranslation } from '@/lib/i18n';
import MyAnalysesList from '@/components/Header/MyAnalysesList';
import styles from './profile.module.scss';

/** "Analizlerim": header'daki "AI Analizlerim" menüsüyle AYNI veri (`MyAnalysesList` → /api/credits/my-analyses). */
export default function AnalysesTab() {
  const { t } = useTranslation('profile');
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t('tabs.analyses')}</h2>
      <p className={styles.hint}>{t('analysesHint')}</p>
      <div className={styles.listBox}>
        <MyAnalysesList />
      </div>
    </section>
  );
}
