import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import { useBottomStackSlot } from '@/hooks/useBottomStackSlot';
import { useNudgeStack } from '@/components/SignupNudge/useNudgeStack';
import { REWARD_TASKS_QUERY_KEY } from '@/components/RewardTasks/queryKey';
import type { OnboardingStatus } from '@/server/rewards';
import styles from '@/components/SignupNudge/signupNudge.module.scss';
import { REWARD_NUDGE_STORAGE_KEY, istanbulDay, pickNudgeMessage, type NudgeMessage } from './pick';

async function fetchStatus(): Promise<OnboardingStatus> {
  const res = await fetch('/api/rewards/tasks', { credentials: 'include' });
  if (!res.ok) throw new Error('tasks');
  return res.json() as Promise<OnboardingStatus>;
}

function messageText(t: (k: string, o?: Record<string, unknown>) => string, m: NudgeMessage): string {
  switch (m.kind) {
    case 'verify':
      return t('nudge.verify');
    case 'frikik':
      return t('nudge.frikik', { days: m.days, target: m.target });
    case 'frikikDone':
      return t('nudge.frikikDone', { target: m.target });
    case 'game':
      return t('nudge.game', { picks: m.picks, matches: m.matches });
    case 'gameDone':
      return t('nudge.gameDone');
    case 'tasksReady':
      return t('nudge.tasksReady', { count: m.count });
    case 'tasksOpen':
      return t('nudge.tasksOpen', { count: m.count });
    case 'games':
      return t('nudge.games', { days: m.days, target: m.target });
  }
}

/** Ödül kartı: veri gelince çizilir; ekranda göründüğü an o gün için işaretlenir (kapatılsa da kapatılmasa da günde bir kez). */
export default function RewardNudgeCard({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('credits');
  const { pathname } = useRouter();
  const [closed, setClosed] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const q = useQuery({ queryKey: REWARD_TASKS_QUERY_KEY, queryFn: fetchStatus, staleTime: 30_000, retry: false });
  const message = q.data ? pickNudgeMessage(pathname, q.data) : null;
  const visible = !!message && !closed;
  useBottomStackSlot(ref, visible);
  useNudgeStack(ref, visible);

  // Gün işareti kart GERÇEKTEN göründüğünde konur: Frikik'te saha ekrandayken kart gizlidir (data-game-active), kullanıcı
  // aşağı kaydırıp gördüğünde o gün tamamlanır; hiç görmeden günü yakmaz.
  useEffect(() => {
    const el = ref.current;
    if (!visible || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      try {
        localStorage.setItem(REWARD_NUDGE_STORAGE_KEY, istanbulDay(Date.now()));
      } catch {
        /* yoksay */
      }
      io.disconnect();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (q.isError) onDone();
  }, [q.isError, onDone]);

  if (!visible) return null;
  const close = () => {
    setClosed(true);
    onDone();
  };
  const claim = message.kind === 'tasksReady';

  return (
    <aside ref={ref} className={styles.nudge} role="complementary" aria-label={t('nudge.title')}>
      <span className={styles.icon} aria-hidden="true">
        🎁
      </span>
      <div className={styles.body}>
        <strong>{t('nudge.title')}</strong>
        <span>{messageText(t, message)}</span>
        <Link href="/profile?tab=credits" className={styles.cta} onClick={close}>
          {claim ? t('nudge.ctaClaim') : t('nudge.cta')}
        </Link>
      </div>
      <button type="button" className={styles.close} onClick={close} aria-label={t('nudge.close')}>
        ×
      </button>
    </aside>
  );
}
