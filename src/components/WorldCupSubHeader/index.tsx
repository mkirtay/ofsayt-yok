import { useTranslation } from '@/lib/i18n';
import Container from '../Container';
import styles from './worldCupSubHeader.module.scss';

export type WorldCupMainTab = 'groups' | 'matches' | 'calendar' | 'bracket' | 'teams';

type WorldCupSubHeaderProps = {
  activeTab: WorldCupMainTab;
  onTabChange: (tab: WorldCupMainTab) => void;
};

const TAB_KEYS: WorldCupMainTab[] = ['groups', 'matches', 'calendar', 'bracket', 'teams'];

export default function WorldCupSubHeader({ activeTab, onTabChange }: WorldCupSubHeaderProps) {
  const { t } = useTranslation('match');

  const tabs = TAB_KEYS.map((key) => ({
    key,
    label: t(`worldCup.${key}`),
  }));

  return (
    <div className={styles.subHeader}>
      <Container className={styles.inner}>
        <nav className={styles.tabs} aria-label={t('worldCup.tabsAriaLabel')}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </Container>
    </div>
  );
}
