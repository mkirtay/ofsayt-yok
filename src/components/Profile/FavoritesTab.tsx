import { useState } from 'react';
import Link from 'next/link';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@/lib/i18n';
import LeagueLogo from '@/components/LeagueLogo';
import { SIDEBAR_LEAGUES, UEFA_SIDEBAR_LEAGUES } from '@/config/leagues';
import { resolveSidebarLeagueLogo } from '@/utils/leagueLogo';
import { leagueDisplayName } from '@/utils/leagueName';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import { HOME_FAVORITES_LS_KEY, mergeFavoriteIds, parseLocalFavoriteIds } from '@/utils/favoriteImport';
import styles from './profile.module.scss';

type Favorites = { favoriteTeamIds: number[]; favoriteLeagueIds: number[] };
const FAV_KEY = ['favorites-me'] as const;

async function fetchFavorites(): Promise<Favorites> {
  const res = await fetch('/api/user/favorites', { credentials: 'include' });
  if (!res.ok) throw new Error('favorites');
  return res.json() as Promise<Favorites>;
}

async function saveFavorites(patch: Partial<Favorites>): Promise<Favorites> {
  const res = await fetch('/api/user/favorites', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('favorites-save');
  return res.json() as Promise<Favorites>;
}

type Named = { id: number; name: string; logo: string | null };

/** DB yalnızca id tutar: takım adları/logoları Sportmonks'tan (id başına 1 istek, 30 dk cache'li) çözülür. */
function useTeamNames(ids: number[]): Map<number, Named | null> {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['fav-team', id],
      queryFn: async (): Promise<Named | null> => {
        const env = await sportmonksClientRequest<{ id: number; name?: string; image_path?: string | null }>('football', `/teams/${id}`);
        const d = env.data;
        return d?.name ? { id, name: d.name, logo: d.image_path ?? null } : null;
      },
      staleTime: 30 * 60_000,
      retry: 1,
    })),
  });
  return new Map(ids.map((id, i) => [id, results[i]?.data ?? null]));
}

/** Lig id'leri: önce yerel lig listesi (yan panel/UEFA — logo dahil), yoksa Sportmonks `/leagues/{id}`. */
function useLeagueNames(ids: number[]): Map<number, Named | null> {
  const { t: tl } = useTranslation('leagues');
  const local = new Map<number, Named>();
  for (const l of [...SIDEBAR_LEAGUES, ...UEFA_SIDEBAR_LEAGUES]) {
    if (ids.includes(l.id)) local.set(l.id, { id: l.id, name: leagueDisplayName(l, tl), logo: resolveSidebarLeagueLogo(l) });
  }
  const remoteIds = ids.filter((id) => !local.has(id));
  const results = useQueries({
    queries: remoteIds.map((id) => ({
      queryKey: ['fav-league', id],
      queryFn: async (): Promise<Named | null> => {
        const env = await sportmonksClientRequest<{ id: number; name?: string; image_path?: string | null }>('football', `/leagues/${id}`);
        const d = env.data;
        return d?.name ? { id, name: d.name, logo: d.image_path ?? null } : null;
      },
      staleTime: 30 * 60_000,
      retry: 1,
    })),
  });
  const out = new Map<number, Named | null>(local);
  remoteIds.forEach((id, i) => out.set(id, results[i]?.data ?? null));
  return out;
}

/** "Favorilerim": DB favorileri (takım + lig), kaldırma ve cihaz (localStorage) favorilerini içeri aktarma. */
export default function FavoritesTab() {
  const { t } = useTranslation('profile');
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: FAV_KEY, queryFn: fetchFavorites, staleTime: 30_000 });
  const teamIds = q.data?.favoriteTeamIds ?? [];
  const leagueIds = q.data?.favoriteLeagueIds ?? [];
  const teams = useTeamNames(teamIds);
  const leagues = useLeagueNames(leagueIds);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  async function remove(kind: 'team' | 'league', id: number) {
    if (!q.data) return;
    setMsg(null);
    const next: Favorites = {
      favoriteTeamIds: kind === 'team' ? teamIds.filter((x) => x !== id) : teamIds,
      favoriteLeagueIds: kind === 'league' ? leagueIds.filter((x) => x !== id) : leagueIds,
    };
    queryClient.setQueryData(FAV_KEY, next); // iyimser güncelleme
    try {
      queryClient.setQueryData(FAV_KEY, await saveFavorites(kind === 'team' ? { favoriteTeamIds: next.favoriteTeamIds } : { favoriteLeagueIds: next.favoriteLeagueIds }));
    } catch {
      queryClient.setQueryData(FAV_KEY, q.data);
      setMsg({ type: 'err', text: t('favorites.error') });
    }
  }

  async function importFromDevice() {
    setMsg(null);
    let local: number[] = [];
    try {
      local = parseLocalFavoriteIds(localStorage.getItem(HOME_FAVORITES_LS_KEY));
    } catch {
      /* localStorage kapalı */
    }
    const { merged, added } = mergeFavoriteIds(teamIds, local);
    if (added.length === 0) {
      setMsg({ type: 'ok', text: local.length === 0 ? t('favorites.importNone') : t('favorites.importNothingNew') });
      return;
    }
    setBusy(true);
    try {
      queryClient.setQueryData(FAV_KEY, await saveFavorites({ favoriteTeamIds: merged }));
      setMsg({ type: 'ok', text: t('favorites.imported', { count: added.length }) });
    } catch {
      setMsg({ type: 'err', text: t('favorites.error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('favorites.teams')}</h2>
        {q.isLoading ? <p className={styles.hint}>{t('loading')}</p> : null}
        {q.isError ? <p className={`${styles.message} ${styles.err}`}>{t('favorites.error')}</p> : null}
        {q.data && teamIds.length === 0 ? <p className={styles.hint}>{t('favorites.emptyTeams')}</p> : null}
        <ul className={styles.favList}>
          {teamIds.map((id) => {
            const info = teams.get(id);
            return (
              <li key={id} className={styles.favItem}>
                <Link href={`/teams/${id}`} className={styles.favLink}>
                  <LeagueLogo src={info?.logo} size={24} />
                  <span className={styles.favName}>{info?.name ?? `#${id}`}</span>
                </Link>
                <button type="button" className={styles.removeBtn} onClick={() => void remove('team', id)} aria-label={t('favorites.removeAria', { name: info?.name ?? `#${id}` })}>
                  {t('favorites.remove')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('favorites.leagues')}</h2>
        {q.data && leagueIds.length === 0 ? <p className={styles.hint}>{t('favorites.emptyLeagues')}</p> : null}
        <ul className={styles.favList}>
          {leagueIds.map((id) => {
            const info = leagues.get(id);
            return (
              <li key={id} className={styles.favItem}>
                <span className={styles.favLink}>
                  <LeagueLogo src={info?.logo} size={24} />
                  <span className={styles.favName}>{info?.name ?? `#${id}`}</span>
                </span>
                <button type="button" className={styles.removeBtn} onClick={() => void remove('league', id)} aria-label={t('favorites.removeAria', { name: info?.name ?? `#${id}` })}>
                  {t('favorites.remove')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('favorites.importTitle')}</h2>
        <p className={styles.hint}>{t('favorites.importHint')}</p>
        <button type="button" className={styles.submit} onClick={() => void importFromDevice()} disabled={busy || !q.data}>
          {busy ? t('saving') : t('favorites.importButton')}
        </button>
      </section>

      {msg ? <p className={`${styles.message} ${msg.type === 'ok' ? styles.ok : styles.err}`}>{msg.text}</p> : null}
    </>
  );
}
