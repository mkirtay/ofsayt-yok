import { useEffect, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useI18n, useTranslation } from '@/lib/i18n';
import Avatar from '@/components/Avatar';
import '@/lib/i18nNamespaces/game';
import { GAME_BRAND } from '@/config/brand';
import type { BoardScope, LeaderboardView, MyStandingView } from '@/lib/game/types';
import { formatKickoff } from './format';
import styles from './game.module.scss';

type Scope = BoardScope;

/**
 * Haftalık / günlük / sezonluk sıralama — maçlar sonuçlanmadan da tahmin yapan HERKES (puan 0; tahmin sayısı n/10, n/3).
 * Üstte katılımcı sayacı + ilk sonuç saati. İlk veri sunucudan (`initial`, CDN önbellekli sayfa); sekme değişince herkese açık uç;
 * maçlar sürerken dakikada bir yenilenir. Girişliyse kendi satırı (ilk 50'de yoksa altta sabit "Sen"); engellediğin kullanıcılar
 * gizli (Gündem engel kuralı). `limit`: landing'de ilk 10 + "Tüm sıralama" (podyum yok); tam sıralamada
 * (Sıralama sekmesi) ilk 3 podyumda, tablo 4.'den devam eder.
 */
export default function Leaderboard({
  weekKey,
  season,
  dayKey = null,
  scopes,
  initial,
  initialScope = 'season',
  limit,
  title,
}: {
  weekKey: string | null;
  season: string;
  /** Günlük tablo anahtarı (bugün). */
  dayKey?: string | null;
  /** Sekmeler (varsayılan: hafta varsa Bu hafta | Sezon). Tek kapsam → sekme yok. */
  scopes?: Scope[];
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
  const { locale } = useI18n();
  const key = scope === 'week' ? weekKey : scope === 'day' ? dayKey : season;
  const tabs = scopes ?? (weekKey ? (['week', 'season'] as Scope[]) : []);

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

  // Canlı güncelleme: listede sonuçlanmamış maç varken dakikada bir (sekme görünürken) tablo ve kendi satırım yeniden alınır.
  const live = !!boards[scope] && scope !== 'season' && (boards[scope]!.settledCount ?? 0) < (boards[scope]!.matchCount ?? 0);
  useEffect(() => {
    if (!live || !key) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      // Eski veri ekranda kalır; yenisi gelince değişir (yükleniyor titremesi yok).
      fetch(`/api/game/leaderboard?scope=${scope}&key=${key}`)
        .then((r) => (r.ok ? (r.json() as Promise<LeaderboardView>) : null))
        .then((b) => b && setBoards((p) => ({ ...p, [scope]: b })))
        .catch(() => {});
      if (status === 'authenticated')
        fetch(`/api/game/leaderboard/me?scope=${scope}&key=${key}`, { credentials: 'include' })
          .then((r) => (r.ok ? (r.json() as Promise<MyStandingView>) : null))
          .then((m) => m && setMine((p) => ({ ...p, [scope]: m })))
          .catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [live, scope, key, status]);

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
  const me = mine[scope];
  const blocked = new Set(me?.blockedNicknames ?? []);
  const rows = (board?.entries ?? []).filter((r) => !blocked.has(r.nickname)).slice(0, limit ?? 50);
  const total = board?.matchCount ?? null;
  const picksLabel = (n: number) => (total ? t('board2.picksOf', { n, total }) : t('board2.picks', { count: n }));
  const showMine = me && me.rank && me.rank > rows.length;
  // Podyum yalnız puan alan varken (sonuç öncesi herkes 0 → düz liste, madalya yok).
  const podium = !limit && rows.length >= 3 && rows[0]!.points > 0 ? rows.slice(0, 3) : [];
  const tableRows = podium.length ? rows.slice(3) : rows;
  const leader = Math.max(1, rows[0]?.points ?? 1);
  const side = !!limit;

  return (
    <section className={side ? styles.sideSection : styles.section} aria-labelledby="game-board-title">
      <h2 id="game-board-title" className={side ? styles.sideTitle : styles.h2}>
        {title ?? t('board.title')}
      </h2>
      {tabs.length > 1 ? (
        <div className={styles.tabs} role="tablist" aria-label={t('board.title')}>
          {tabs.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={scope === s} aria-controls="game-board-panel" className={styles.tab} onClick={() => setScope(s)}>
              {t(s === 'day' ? 'board.today' : `board.${s}`)}
            </button>
          ))}
        </div>
      ) : null}
      <div id="game-board-panel" role="tabpanel" className={side ? styles.sideCard : styles.card}>
        {board ? (
          <p className={styles.boardSummary}>
            <strong>{t(`board2.count.${scope}`, { count: board.participants })}</strong>
            {board.firstKickoffAt ? (
              <span>{t('board2.firstResult', { at: formatKickoff(board.firstKickoffAt, locale) })}</span>
            ) : board.matchCount ? (
              <span>{t('board2.settled', { done: board.settledCount ?? 0, total: board.matchCount })}</span>
            ) : null}
          </p>
        ) : null}
        {rows.length === 0 ? (
          board === undefined && !error ? (
            <p className={styles.muted}>{t('board.loading')}</p>
          ) : error ? (
            <p className={styles.muted}>{t('board.error')}</p>
          ) : (
            <div className={styles.boardEmpty}>
              <p>{t('board2.emptyTitle')}</p>
              <Link href={`${GAME_BRAND.basePath}${scope === 'day' ? '?oyun=gunluk' : '?oyun=haftalik'}#hafta`} className={styles.btn}>
                {t('nav.play')}
              </Link>
            </div>
          )
        ) : (
          <>
            {podium.length ? (
              <ol className={styles.podium} aria-label={t('board.podium')}>
                {podium.map((r) => (
                  <li key={r.nickname} data-place={r.rank} data-me={me?.rank === r.rank ? '' : undefined}>
                    <span className={styles.podiumMedal} aria-hidden="true">
                      {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : '🥉'}
                    </span>
                    <PlayerAvatar nickname={r.nickname} image={r.image} size={r.rank === 1 ? 48 : 40} />
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
              <ol className={styles.boardList} aria-label={title ?? t('board.title')}>
                {tableRows.map((r) => (
                  <BoardRow key={r.nickname} rank={r.rank} nickname={r.nickname} image={r.image} points={r.points} exact={r.exact} picks={picksLabel(r.picks)} leader={leader} me={me?.rank === r.rank} />
                ))}
                {showMine ? <BoardRow rank={me.rank!} nickname={t('board.you')} image={me.image} points={me.points} exact={me.exact} picks={picksLabel(me.picks)} leader={leader} me separated /> : null}
              </ol>
            ) : null}
          </>
        )}
      </div>
      {limit ? (
        <Link href={`${GAME_BRAND.basePath}/siralama`} className={styles.sideLink}>
          {t('board.all')} →
        </Link>
      ) : null}
    </section>
  );
}

/** Baş harf avatarının tonu: takma addan sabit renk (koyu doygunluk → beyaz harf ≥ 4.5:1 iki temada). */
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/**
 * Oyuncu görseli: profil fotoğrafı (User.image; resmi hesapta logo — Gündem ile aynı @/components/Avatar), yoksa / yüklenemezse
 * takma addan sabit tonlu baş harf.
 */
function PlayerAvatar({ nickname, image, size }: { nickname: string; image: string | null; size: number }) {
  const vars = { '--avatar-bg': `hsl(${hueOf(nickname)} 45% 32%)`, '--avatar-fg': '#fff' } as CSSProperties;
  return (
    <span className={styles.playerAvatar} style={vars} aria-hidden="true">
      <Avatar name={nickname} image={image} size={size} />
    </span>
  );
}

/** Sıralama satırı: madalya (ilk 3) ya da sıra, baş harf avatarı, ad + tam skor, lidere göre puan çubuğu. */
function BoardRow({
  rank,
  nickname,
  image,
  points,
  exact,
  picks,
  leader,
  me,
  separated,
}: {
  rank: number;
  nickname: string;
  image: string | null;
  points: number;
  exact: number;
  picks: string;
  leader: number;
  me?: boolean;
  separated?: boolean;
}) {
  const { t } = useTranslation('game');
  return (
    <li className={styles.boardRow} data-me={me ? '' : undefined} data-separated={separated ? '' : undefined}>
      <span className={styles.boardRank} data-medal={rank <= 3 && points > 0 ? rank : undefined}>
        {rank}
      </span>
      <PlayerAvatar nickname={nickname} image={image} size={32} />
      <span className={styles.boardWho}>
        <span className={styles.boardNick}>
          {nickname}
          {me && !separated ? <span className={styles.youTag}>{t('board.you')}</span> : null}
        </span>
        <span className={styles.boardBar} aria-hidden="true">
          <span style={{ width: `${Math.min(100, (points / leader) * 100)}%` }} />
        </span>
      </span>
      <span className={styles.boardPts}>
        <strong>
          {points}
          <span className={styles.srOnly}> {t('board.points')}</span>
        </strong>
        <span>
          {picks} · {t('board2.exactShort', { count: exact })}
        </span>
      </span>
    </li>
  );
}
