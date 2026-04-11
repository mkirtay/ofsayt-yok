import { ReactNode } from 'react';
import Container from '../Container';
import WorldCupSubHeader, { WorldCupMainTab } from '../WorldCupSubHeader';

type WorldCupLayoutProps = {
  activeTab: WorldCupMainTab;
  onTabChange: (tab: WorldCupMainTab) => void;
  sidebar: ReactNode;
  content: ReactNode;
};

export default function WorldCupLayout({
  activeTab,
  onTabChange,
  sidebar,
  content,
}: WorldCupLayoutProps) {
  return (
    <>
      <WorldCupSubHeader activeTab={activeTab} onTabChange={onTabChange} />
      <Container>
        <div className="layout-split">
          <aside className="layout-right">{sidebar}</aside>
          <div className="layout-left">{content}</div>
        </div>
      </Container>
    </>
  );
}
