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
import styles from './rewardNudge.module.scss';
import { REWARD_NUDGE_STORAGE_KEY, istanbulDay, nudgeTheme, pickNudgeMessage, type NudgeMessage, type NudgeTheme } from './pick';

async function fetchStatus(): Promise<OnboardingStatus> {
  const res = await fetch('/api/rewards/tasks', { credentials: 'include' });
  if (!res.ok) throw new Error('tasks');
  return res.json() as Promise<OnboardingStatus>;
}

type T = (k: string, o?: Record<string, unknown>) => string;

/** Kicker (üst etiket), başlık ve açıklama — tür başına çeviri anahtarları (`nudge.<tür>.kicker|title|meta`). */
function texts(t: T, m: NudgeMessage): { kicker: string; title: string; meta: string } {
  const p: Record<string, unknown> = { ...m };
  if (m.kind === 'frikik') p.left = m.target - m.days;
  if (m.kind === 'game') p.left = m.matches - m.picks;
  return { kicker: t(`nudge.${m.kind}.kicker`, p), title: t(`nudge.${m.kind}.title`, p), meta: t(`nudge.${m.kind}.meta`, p) };
}

/** Frikik: saha çizgisi + kale filesi + top. Tahmin: kupa. Görev: hediye kutusu + konfeti. Yazısız, aria-hidden. */
function Deco({ theme }: { theme: NudgeTheme }) {
  if (theme === 'frikik') {
    return (
      <svg className={styles.deco} viewBox="0 0 180 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
        <g className={styles.net}>
          {[86, 100, 114, 128, 142, 156, 170].map((x) => (
            <path key={`v${x}`} d={`M${x} 20 V 92`} />
          ))}
          {[34, 48, 62, 76].map((y) => (
            <path key={`h${y}`} d={`M72 ${y} H 184`} />
          ))}
        </g>
        <path className={styles.line} d="M72 92 V 20 H 190" />
        <path className={styles.line} d="M20 92 H 190 M40 150 a46 46 0 0 1 92 0" />
        <g transform="translate(132 118)">
          <circle className={styles.ball} r="15" />
          <path className={styles.ballSeam} d="M0-15 L5-7 L13-6 M-13-6 L-5-7 L0-15 M-5-7 L-6 2 L0 7 L6 2 L5-7 M-6 2 L-13 7 M6 2 L13 7 M0 7 L0 15" />
        </g>
      </svg>
    );
  }
  if (theme === 'game') {
    return (
      <svg className={styles.deco} viewBox="0 0 180 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
        <path className={styles.line} d="M10 140 H 190" />
        <g transform="translate(118 34)">
          <path className={styles.trophy} d="M-30 0 H30 V22 C30 46 14 58 0 60 C-14 58 -30 46 -30 22 Z" />
          <path className={styles.trophy} d="M-30 8 H-44 C-46 30 -36 38 -26 38 M30 8 H44 C46 30 36 38 26 38" />
          <path className={styles.trophy} d="M-6 60 V76 H6 V60 M-22 76 H22 V90 H-22 Z" />
        </g>
        <circle className={styles.confetti} cx="62" cy="30" r="3" />
        <circle className={styles.confetti} cx="168" cy="22" r="2.5" />
        <circle className={styles.confetti} cx="78" cy="96" r="2" />
      </svg>
    );
  }
  return (
    <svg className={styles.deco} viewBox="0 0 180 160" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
      <g transform="translate(120 70)">
        <rect className={styles.gift} x="-34" y="-8" width="68" height="52" rx="4" />
        <rect className={styles.gift} x="-40" y="-24" width="80" height="18" rx="4" />
        <path className={styles.gift} d="M0 -24 V44 M0 -24 C-10 -44 -34 -40 -24 -26 M0 -24 C10 -44 34 -40 24 -26" />
      </g>
      {[
        [60, 26, 3],
        [170, 18, 2.5],
        [70, 120, 2.5],
        [92, 58, 2],
        [176, 128, 3],
      ].map(([x, y, r]) => (
        <circle key={`${x}-${y}`} className={styles.confetti} cx={x} cy={y} r={r} />
      ))}
    </svg>
  );
}

function Progress({ m, t }: { m: NudgeMessage; t: T }) {
  if (m.kind === 'frikik' || m.kind === 'frikikDone') {
    const days = m.kind === 'frikik' ? m.days : m.target;
    return (
      <ol className={styles.dots} aria-label={t('nudge.frikik.progress', { days, target: m.target })}>
        {Array.from({ length: m.target }, (_, i) => (
          <li key={i} className={styles.dot} data-on={i < days ? '' : undefined}>
            {i === m.target - 1 ? '+2' : ''}
          </li>
        ))}
      </ol>
    );
  }
  if (m.kind === 'game' || m.kind === 'gameDone') {
    const picks = m.kind === 'game' ? m.picks : 1;
    const matches = m.kind === 'game' ? m.matches : 1;
    return (
      <>
        <div className={styles.bar} role="progressbar" aria-valuemin={0} aria-valuemax={matches} aria-valuenow={picks}>
          <span className={styles.barFill} style={{ width: `${Math.round((picks / matches) * 100)}%` }} />
        </div>
        {m.kind === 'game' ? <p className={styles.barLabel}>{t('nudge.game.progress', { picks, matches })}</p> : null}
      </>
    );
  }
  return null;
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
  const theme = nudgeTheme(message);
  const { kicker, title, meta } = texts(t, message);

  return (
    <aside ref={ref} className={styles.card} data-theme={theme} role="complementary" aria-label={kicker}>
      <Deco theme={theme} />
      <p className={styles.kicker}>{kicker}</p>
      <p className={styles.title}>{title}</p>
      <p className={styles.meta}>{meta}</p>
      <Progress m={message} t={t} />
      <Link href="/profile?tab=credits" className={styles.cta} onClick={close}>
        {message.kind === 'tasksReady' ? t('nudge.ctaClaim') : t('nudge.cta')}
      </Link>
      <button type="button" className={styles.close} onClick={close} aria-label={t('nudge.close')}>
        ×
      </button>
    </aside>
  );
}
