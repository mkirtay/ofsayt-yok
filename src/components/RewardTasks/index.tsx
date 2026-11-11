import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { GAME_BRAND } from '@/config/brand';
import { useCredits } from '@/hooks/useCredits';
import { profileSummaryQueryKey } from '@/hooks/useProfileSummary';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/credits';
import type { OnboardingTask } from '@/lib/rewards';
import type { OnboardingStatus } from '@/server/rewards';
import styles from './rewardTasks.module.scss';

const TASK_HREF: Record<OnboardingTask, string> = {
  analysis: '/',
  prediction: GAME_BRAND.basePath,
  gundem: '/gundem',
  frikik: '/frikik',
};

export const REWARD_TASKS_QUERY_KEY = ['rewards', 'tasks'] as const;

async function fetchTasks(): Promise<OnboardingStatus> {
  const res = await fetch('/api/rewards/tasks', { credentials: 'include' });
  if (!res.ok) throw new Error('tasks');
  return res.json() as Promise<OnboardingStatus>;
}

/**
 * "Ücretsiz kredi kazan": başlangıç görevleri (her biri +1, bir kez) + oyun ödüllerinin kısa kuralı. Yalnız girişli
 * kullanıcıda çizilir (çağıran kontrol eder). Bütün görevler alınmışsa görev listesi gizlenir, oyun kuralı kalır.
 * Ödül sunucuda doğrulanır (POST /api/rewards/tasks); bakiye yanıttaki değerle anında güncellenir.
 */
export default function RewardTasks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation('credits');
  const { apply } = useCredits();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<OnboardingTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: REWARD_TASKS_QUERY_KEY, queryFn: fetchTasks, staleTime: 30_000 });

  const claim = async (task: OnboardingTask) => {
    if (busy) return;
    setBusy(task);
    setError(null);
    try {
      const res = await fetch('/api/rewards/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      const body = (await res.json().catch(() => ({}))) as { credits?: number; error?: string };
      if (typeof body.credits === 'number') apply(body.credits);
      if (!res.ok && res.status !== 409) setError(body.error ?? t('tasks.error'));
    } catch {
      setError(t('tasks.error'));
    } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: REWARD_TASKS_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ['credit-history'] });
      void qc.invalidateQueries({ queryKey: profileSummaryQueryKey });
    }
  };

  const data = q.data;
  const open = data?.tasks.filter((x) => !x.claimed) ?? [];

  return (
    <section className={styles.box} aria-labelledby="reward-tasks-title">
      <h3 id="reward-tasks-title" className={styles.title}>
        {t('tasks.title')}
      </h3>
      {data && open.length > 0 ? (
        <>
          <p className={styles.desc}>{t('tasks.desc')}</p>
          {!data.verified ? <p className={styles.warn}>{t('tasks.verifyFirst')}</p> : null}
          <ul className={styles.list}>
            {data.tasks.map((task) => (
              <li key={task.id} className={styles.item} data-done={task.claimed ? '' : undefined}>
                <span className={styles.check} aria-hidden="true">
                  {task.claimed || task.done ? '✓' : ''}
                </span>
                <span className={styles.label}>{t(`tasks.items.${task.id}`)}</span>
                {task.claimed ? (
                  <span className={styles.claimed}>{t('tasks.claimed')}</span>
                ) : task.done ? (
                  <button
                    type="button"
                    className={styles.claim}
                    onClick={() => void claim(task.id)}
                    disabled={busy !== null || !data.verified}
                    aria-busy={busy === task.id}
                  >
                    {busy === task.id ? t('tasks.claiming') : t('tasks.claim', { count: task.reward })}
                  </button>
                ) : (
                  <Link href={TASK_HREF[task.id]} className={styles.todo} onClick={onNavigate}>
                    {t('tasks.todo')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
        </>
      ) : null}
      <div className={styles.games}>
        <p className={styles.gamesTitle}>{t('tasks.gamesTitle')}</p>
        {(['Prediction', 'Frikik'] as const).map((g) => (
          <div key={g} className={styles.game}>
            <p className={styles.gameName}>{t(`tasks.games${g}`)}</p>
            <ul className={styles.gameRules}>
              <li>{t(`tasks.games${g}1`)}</li>
              <li>{t(`tasks.games${g}2`)}</li>
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
