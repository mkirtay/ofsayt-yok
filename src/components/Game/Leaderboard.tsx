import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { GAME_BRAND } from '@/config/brand';
import type { LeaderboardView, MyStandingView } from '@/lib/game/types';
import styles from './game.module.scss';

type Scope = 'week' | 'season';

/**
 * Haftalık / sezonluk sıralama. İlk veri sunucudan (`initial`, CDN önbellekli sayfa); sekme değişince herkese açık uç.
 * Girişliyse kendi satırı (ilk listede yoksa altta). `limit`: landing'de ilk 10 + "Tüm sıralama" (podyum yok); tam sıralamada
 * (Sıralama sekmesi) ilk 3 podyumda, tablo 4.'den devam eder.
 */
export default function Leaderboard({
  weekKey,
  season,
  initial,
  initialScope = 'season',
  limit,
  title,
}: {
  weekKey: string | null;
  season: string;
  initial: LeaderboardView | null;
  initialScope?: Scope;
  limit?: number;
  title?: string;
}) {
  const { t } = useTranslation('game');
  const { status } = useSession();
  const [scope, setScope] = useState<Scope>(initialScope);
  const [boards, setBoards] = useState<Partial<Record<Scope, LeaderboardView | null>>>(initial ? { [initial.scope]: initial } : {});
  const [error, setError] = useState(false);
  const [mine, setMine] = useState<Partial<Record<Scope, MyStandingView | null>>>({});
  const key = scope === 'week' ? weekKey : season;

  useEffect(() => {
    if (!key || boards[scope] !== undefined) return;
    let cancelled = false;
    fetch(`/api/game/leaderboard?scope=${scope}&key=${key}`)
      .then((r) => (r.ok ? (r.json() as Promise<LeaderboardView>) : r.status === 404 ? null : Promise.reject(new Error(String(r.status)))))
      .then((b) => !cancelled && setBoards((p) => ({ ...p, [scope]: b })))
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [scope, key, boards]);

  useEffect(() => {
    if (status !== 'authenticated' || !key || mine[scope] !== undefined) return;
    let cancelled = false;
    fetch(`/api/game/leaderboard/me?scope=${scope}&key=${key}`, {
      credentials: 'include',
    })
      .then((r) => (r.ok ? (r.json() as Promise<MyStandingView>) : null))
      .then((m) => !cancelled && setMine((p) => ({ ...p, [scope]: m })))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, scope, key, mine]);

  const board = boards[scope];
  const rows = (board?.entries ?? []).slice(0, limit ?? 50);
  const me = mine[scope];
  const showMine = me && me.rank && me.rank > rows.length;
  const podium = !limit && rows.length >= 3 ? rows.slice(0, 3) : [];
  const tableRows = podium.length ? rows.slice(3) : rows;

  return (
    <section className={styles.section} aria-labelledby="game-board-title">
      <h2 id="game-board-title" className={styles.h2}>
        {title ?? t('board.title')}
      </h2>
      {weekKey ? (
        <div className={styles.tabs} role="tablist" aria-label={t('board.title')}>
          {(['week', 'season'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={scope === s} aria-controls="game-board-panel" className={styles.tab} onClick={() => setScope(s)}>
              {t(`board.${s}`)}
            </button>
          ))}
        </div>
      ) : null}
      <div id="game-board-panel" role="tabpanel" className={styles.card}>
        {rows.length === 0 ? (
          <p className={styles.muted}>
            {board === undefined && !error ? t('board.loading') : error ? t('board.error') : scope === 'season' ? t('board.seasonEmpty') : t('board.empty')}
          </p>
        ) : (
          <>
            {podium.length ? (
              <ol className={styles.podium} aria-label={t('board.podium')}>
                {podium.map((r) => (
                  <li key={r.nickname} data-place={r.rank} data-me={me?.rank === r.rank ? '' : undefined}>
                    <span className={styles.podiumMedal} aria-hidden="true">
                      {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}
                    </span>
                    <span className={styles.podiumPts}>{r.points}</span>
                    <span className={styles.podiumNick}>
                      <span className={styles.srOnly}>{r.rank}. </span>
                      {me?.rank === r.rank ? `${r.nickname} (${t('board.you')})` : r.nickname}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {tableRows.length || showMine ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">{t('board.player')}</th>
                    <th scope="col" className={styles.num}>
                      {t('board.exact')}
                    </th>
                    <th scope="col" className={styles.num}>
                      {t('board.points')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((r) => (
                    <tr key={r.nickname} data-me={me?.rank === r.rank ? '' : undefined}>
                      <td>{r.rank}</td>
                      <td className={styles.nick}>{r.nickname}</td>
                      <td className={styles.num}>{r.exact}</td>
                      <td className={styles.num}>{r.points}</td>
                    </tr>
                  ))}
                  {showMine ? (
                    <tr data-me="">
                      <td>{me.rank}</td>
                      <td className={styles.nick}>{t('board.you')}</td>
                      <td className={styles.num}>{me.exact}</td>
                      <td className={styles.num}>{me.points}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            ) : null}
          </>
        )}
      </div>
      {limit ? <Link href={`${GAME_BRAND.basePath}/siralama`}>{t('board.all')} →</Link> : null}
    </section>
  );
}
