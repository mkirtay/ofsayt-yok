import { useEffect, useState } from 'react';
import MatchPoll from '@/components/MatchPoll';
import MatchForum from '@/components/MatchForum';
import MatchCountersBadge from '@/components/MatchCountersBadge';
import { useGundemFeed } from '@/hooks/useGundem';
import { countsFor, useMatchCounters } from '@/hooks/useMatchCounters';
import { useTranslation } from '@/lib/i18n';
import type { Match } from '@/models/liveScore';
import { matchDisplayState } from '@/utils/matchDisplayState';
import { matchKickoffMs } from '@/utils/matchActivity';
import { liveMinuteLabel } from '@/utils/liveMinute';
import { isPollLockedForMatch } from '@/utils/matchPollLock';
import styles from './matchChatPanel.module.scss';

export type MatchChatPanelProps = {
  matchId: string;
  match: Match | null;
};

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Başlamaya kalan süre: "2 g 4 sa", "3 sa 12 dk", "12:05" (1 saatin altında dk:sn). */
export function formatCountdown(ms: number, t: TFn): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return t('chat.dh', { d, h });
  if (h > 0) return t('chat.hm', { h, m });
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Maç öncesi geri sayım (1 sn), canlıda dakika + skor, bitince "Maç bitti". Veri sayfanın maç durumundan; ek istek yok. */
function MatchStatusLine({ match }: { match: Match | null }) {
  const { t } = useTranslation('match');
  const phase = match ? matchDisplayState(match).phase : null;
  const kickoff = match ? matchKickoffMs(match) : null;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (phase !== 'PRE' || kickoff == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [phase, kickoff]);

  if (!match || !phase) return <p className={styles.status} />;
  const score = (match.scores?.score || match.score || '').trim();
  if (phase === 'POST') {
    return (
      <p className={styles.status}>
        <span className={styles.finished}>{t('chat.finished')}</span>
        {score ? <strong className={styles.score}>{score}</strong> : null}
      </p>
    );
  }
  if (phase === 'LIVE' || phase === 'HT') {
    const minute = phase === 'HT' ? t('chat.halfTime') : liveMinuteLabel(match.time);
    return (
      <p className={styles.status}>
        <span className={styles.liveDot} aria-hidden />
        <span className={styles.live}>{minute || t('chat.live')}</span>
        {score ? <strong className={styles.score}>{score}</strong> : null}
      </p>
    );
  }
  const left = kickoff != null && now != null ? kickoff - now : null;
  return (
    <p className={styles.status}>
      {left == null ? null : left > 0 ? (
        <>
          <span>{t('chat.startsIn')}</span>
          <strong className={styles.countdown} suppressHydrationWarning>
            {formatCountdown(left, t)}
          </strong>
        </>
      ) : (
        <span>{t('chat.startingSoon')}</span>
      )}
    </p>
  );
}

/**
 * Masaüstü "Maç sohbeti" paneli (≥ split eşiği, sağ sütunda yapışkan). Yalnız istemcide, `MatchChatPanelSlot`
 * tarafından yüklenir. İçerik mevcut bileşenlerin yeniden kullanımı: 1X2 anketi (`MatchPoll`) + maç forumu
 * (`MatchForum`, sohbet düzeni: liste kayar, yazma kutusu altta). Yorumlar Forum sekmesiyle aynı sorgu
 * anahtarından gelir — ayrı yoklama döngüsü yok.
 */
export default function MatchChatPanel({ matchId, match }: MatchChatPanelProps) {
  const { t } = useTranslation('match');
  const feed = useGundemFeed('all', { matchId, staleTime: 60_000 });
  const loaded = feed.data?.pages.reduce((n, p) => n + p.items.length, 0) ?? null;
  const counts = countsFor(useMatchCounters([matchId]), matchId);
  const pollLocked = !!match && isPollLockedForMatch(match);

  return (
    <div className={styles.panel}>
      <header className={styles.head}>
        <h2 className={styles.title}>
          <span aria-hidden>💬</span> {t('chat.title')}
          {loaded != null ? (
            <span className={styles.count}>
              {t('chat.commentCount', { count: loaded, plus: feed.hasNextPage ? '+' : '' })}
            </span>
          ) : null}
        </h2>
        {counts ? <MatchCountersBadge counts={counts} variant="header" /> : null}
      </header>
      <MatchStatusLine match={match} />
      <div className={styles.poll}>
        <MatchPoll matchId={matchId} locked={pollLocked} home={match?.home} away={match?.away} />
      </div>
      <MatchForum matchId={matchId} layout="chat" />
    </div>
  );
}
