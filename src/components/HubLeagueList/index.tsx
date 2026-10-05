import { useMemo, useState } from 'react';
import { useI18n, useTranslation } from '@/lib/i18n';
import LeagueLogo from '@/components/LeagueLogo';
import { buildHubLeagueGroups, filterHubLeagueGroups } from '@/config/hubLeagueGroups';
import { competitionLogoNeedsBackdrop } from '@/utils/competitionLogo';
import { hubSelectionIdForLeague } from '@/utils/hubLeagueSelection';
import { parseLeagueImagePath, sportmonksLeagueLogoUrl } from '@/utils/leagueLogo';
import styles from './hubLeagueList.module.scss';

export type HubLeagueListProps = {
  /** Seçili lig (`MatchHubPage` `selectedCompId` — bkz. utils/hubLeagueSelection.ts). */
  selectedId: number;
  /** Satıra tıklanınca: hub seçim id'si. */
  onSelect: (selectionId: number) => void;
  /** Ekrandaki günün maç sayısı (Sportmonks league_id → sayı); 0 / yok → rozet yok. */
  matchCountByLeague: ReadonlyMap<number, number>;
  /** Fikstürdeki `league.image_path` (Sportmonks league_id → URL); yoksa deterministik CDN yolu. */
  apiLogoByLeague: ReadonlyMap<number, string>;
  /** Açılınca aramaya odaklan (lig seçici). */
  autoFocusSearch?: boolean;
};

/**
 * Lig listesi: planımızdaki 34 lig, gruplu (bkz. config/hubLeagueGroups.ts), üstte arama, canlı maç sayacı. Yan
 * paneldeki lig seçici (HubLeaguePicker) açılınca çizilir; logolar `loading="lazy"`. Mobilde alt menüdeki Ligler de
 * aynı seçiciyi (tam ekran) açar.
 */
export default function HubLeagueList({
  selectedId,
  onSelect,
  matchCountByLeague,
  apiLogoByLeague,
  autoFocusSearch = false,
}: HubLeagueListProps) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => buildHubLeagueGroups(tl, locale), [tl, locale]);
  const visible = useMemo(() => filterHubLeagueGroups(groups, query), [groups, query]);

  return (
    <div className={styles.root}>
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('hub.leagueSearchPlaceholder')}
          aria-label={t('hub.leagueSearchPlaceholder')}
          autoComplete="off"
          spellCheck={false}
          // Kullanıcı seçiciyi açtı: odak aramaya
          autoFocus={autoFocusSearch}
        />
      </div>
      {visible.length === 0 ? (
        <p className={styles.empty} role="status">
          {t('hub.leagueSearchEmpty')}
        </p>
      ) : (
        visible.map((group) => (
          <section key={group.key} className={styles.group} aria-labelledby={`hub-league-group-${group.key}`}>
            <h3 id={`hub-league-group-${group.key}`} className={styles.groupTitle}>
              {group.title}
            </h3>
            <ul className={styles.list}>
              {group.leagues.map((league) => {
                const selectionId = hubSelectionIdForLeague(league.id);
                const count = matchCountByLeague.get(league.id) ?? 0;
                const logo = parseLeagueImagePath(apiLogoByLeague.get(league.id)) ?? sportmonksLeagueLogoUrl(league.id);
                const active = selectionId === selectedId;
                return (
                  <li key={league.id}>
                    <button
                      type="button"
                      className={`${styles.item} ${active ? styles.itemActive : ''}`.trim()}
                      aria-current={active ? 'true' : undefined}
                      data-league-id={league.id}
                      onClick={() => onSelect(selectionId)}
                    >
                      <LeagueLogo
                        src={logo}
                        size={20}
                        className={`${styles.logo} ${competitionLogoNeedsBackdrop(league.id) ? styles.logoBackdrop : ''}`.trim()}
                      />
                      <span className={styles.name}>
                        {league.name}
                        {league.showCountry ? <span className={styles.country}>{league.country}</span> : null}
                      </span>
                      {count > 0 ? (
                        <span className={styles.count} title={t('list.matchCount', { count })}>
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
