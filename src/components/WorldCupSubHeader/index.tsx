import Container from '../Container';
import styles from './worldCupSubHeader.module.scss';

export type WorldCupMainTab = 'groups' | 'matches';

type WorldCupSubHeaderProps = {
  activeTab: WorldCupMainTab;
  onTabChange: (tab: WorldCupMainTab) => void;
};

const TABS: Array<{ key: WorldCupMainTab; label: string }> = [
  { key: 'groups', label: 'Gruplar' },
  { key: 'matches', label: 'Maçlar' },
];

export default function WorldCupSubHeader({ activeTab, onTabChange }: WorldCupSubHeaderProps) {
  return (
    <div className={styles.subHeader}>
      <Container className={styles.inner}>
        <nav className={styles.tabs} aria-label="Dünya kupası içerik sekmeleri">
          {TABS.map((tab) => (
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
