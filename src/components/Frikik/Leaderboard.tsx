import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/frikik';
import type { Leaderboard as Board, MyStanding } from '@/hooks/useFrikikBoard';
import styles from './frikik.module.scss';

type Tab = 'daily' | 'monthly' | 'season';

type Row = { rank: number; nickname: string; col: number; score: number };

/**
 * Günlük / Aylık / Sezon sekmeli puan durumu (en iyi 20). Kendi satırı vurgulu; ilk 20'de değilse altta kendi sırası.
 * Veri yokken iskelet değil kısa not (sabit yükseklik gerekmez; sayfanın altında).
 */
export default function Leaderboard({ board, me, loading, error = false }: { board: Board | null; me: MyStanding | null; loading: boolean; error?: boolean }) {
  const { t } = useTranslation('frikik');
  const [tab, setTab] = useState<Tab>('daily');
  // Sezon: "Seviye" yerine oynanan gün, puan = günlük en iyilerin toplamı.
  const rows: Row[] = !board
    ? []
    : tab === 'season'
      ? (board.seasonal ?? []).map((r) => ({ rank: r.rank, nickname: r.nickname, col: r.days, score: r.score }))
      : board[tab].map((r) => ({ rank: r.rank, nickname: r.nickname, col: r.level, score: r.score }));
  const m = tab === 'daily' ? me?.today : tab === 'monthly' ? me?.month_best : null;
  const s = tab === 'season' ? me?.season_total : null;
  const mine = m ? { rank: m.rank, col: m.level, score: m.score } : s ? { rank: s.rank, col: s.days, score: s.score } : null;
  const myName = me?.nickname ?? null;
  const inTop = !!myName && rows.some((r) => r.nickname === myName);

  return (
    <section className={styles.board} aria-labelledby="frikik-board-title">
      <div className={styles.boardHead}>
        <h2 id="frikik-board-title" className={styles.boardTitle}>
          {t('board.title')}
        </h2>
        <div className={styles.tabs} role="tablist" aria-label={t('board.title')}>
          {(['daily', 'monthly', 'season'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`frikik-tab-${k}`}
              aria-selected={tab === k}
              aria-controls="frikik-board-panel"
              className={styles.tab}
              data-active={tab === k ? '' : undefined}
              onClick={() => setTab(k)}
            >
              {t(`board.${k}`)}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.boardSub}>{t(`board.${tab}Sub`)}</p>
      {tab === 'monthly' ? <p className={styles.boardSub}>{t('board.reward')}</p> : null}
      <div id="frikik-board-panel" role="tabpanel" aria-labelledby={`frikik-tab-${tab}`}>
        {rows.length === 0 ? (
          <p className={styles.boardEmpty}>{loading ? t('board.loading') : error ? t('board.error') : t('board.empty')}</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">{t('board.player')}</th>
                <th scope="col">{tab === 'season' ? t('board.days') : t('board.level')}</th>
                <th scope="col">{t('board.points')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.nickname}`} data-me={myName && r.nickname === myName ? '' : undefined}>
                  <td>{r.rank}</td>
                  <td className={styles.nick}>{r.nickname}</td>
                  <td>{r.col}</td>
                  <td className={styles.pts}>{r.score.toLocaleString('tr-TR')}</td>
                </tr>
              ))}
              {mine && !inTop ? (
                <tr data-me="" className={styles.mineRow}>
                  <td>{mine.rank}</td>
                  <td className={styles.nick}>{myName}</td>
                  <td>{mine.col}</td>
                  <td className={styles.pts}>{mine.score.toLocaleString('tr-TR')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
