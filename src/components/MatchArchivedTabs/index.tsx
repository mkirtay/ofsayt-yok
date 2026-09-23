import { useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import MatchTabs, { type MatchTabItem } from '@/components/MatchTabs';
import MatchTrivia from '@/components/MatchTrivia';
import MatchAnalysis from '@/components/MatchAnalysis';
import MatchForumTab from '@/components/MatchForumTab';
import styles from './matchArchivedTabs.module.scss';

type ArchivedTabKey = 'forum' | 'analysis' | 'trivia';

type Props = {
  matchId: string;
};

/**
 * Arşiv maçı (canlı sağlayıcıda artık yok): maç verisi gerektiren "Genel Bakış"
 * dışındaki sekmeler, maç detayıyla AYNI düz sıralamada — Forum | AI Analiz | Trivia.
 */
export default function MatchArchivedTabs({ matchId }: Props) {
  const { t } = useTranslation('match');
  const [active, setActive] = useState<ArchivedTabKey>('forum');

  const tabs = useMemo<MatchTabItem<ArchivedTabKey>[]>(
    () => [
      { key: 'forum', label: t('tabs.forum'), render: () => <MatchForumTab matchId={matchId} /> },
      {
        key: 'analysis',
        label: t('tabs.analysis'),
        premium: true,
        render: () => <MatchAnalysis matchId={matchId} match={null} />,
      },
      {
        key: 'trivia',
        label: t('tabs.trivia'),
        premium: true,
        render: () => <MatchTrivia matchId={matchId} match={null} />,
      },
    ],
    [t, matchId],
  );

  return (
    <div className={styles.content}>
      <MatchTabs tabs={tabs} active={active} onChange={setActive} ariaLabel={t('tabs.label')} />
    </div>
  );
}
