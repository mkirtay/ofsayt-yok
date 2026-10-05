import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  CompetitionTableData,
  CompetitionTableStandingRow,
  SeasonListItem,
} from "@/services/liveScoreService";
import SeasonSelect from "@/components/SeasonSelect";
import { standingsGroupHeading } from "./groupHeading";
import { useTranslation } from "@/lib/i18n";
import { formatSeasonLabel } from "@/utils/seasonLabel";
import { getStandingRankZone } from "@/config/standingsZones";
import { sortWorldCupGroupsByName } from "@/config/worldCup";
import { standingsRankZoneClass } from "@/utils/standingsRankZoneUi";
import { standingTeamFullName } from "@/utils/standingsTeamLabel";
import EmptyState from "@/components/EmptyState";
import LazyLoad from "@/components/LazyLoad";
import StandingTeamName from "@/components/StandingTeamName";
import { StandingsSkeleton } from "@/components/Skeleton";
import styles from "./matchCompetitionStandings.module.scss";
import TeamLogo from '@/components/TeamLogo';

// Yalnız sezon değişirken gerekir: animasyon ve CSS'i ayrı parçada (ana sayfanın ilk yüküne girmez).
const loadStandingsShuffle = () => import("./StandingsShuffle");

function standingTeamId(s: CompetitionTableStandingRow): number | undefined {
  const id = s.team?.id ?? s.team_id;
  return id != null ? Number(id) : undefined;
}


function standingTeamLogo(s: CompetitionTableStandingRow): string | undefined {
  return s.team?.logo || s.logo;
}

const STANDINGS_HEAD = ["#", "Takım", "O", "G", "B", "M", "A", "Y", "Av", "P"] as const;

function StandingsHead() {
  return (
    <thead>
      <tr>
        {STANDINGS_HEAD.map((h, i) => (
          <th
            key={h}
            className={i === 0 ? styles.colRank : i === 1 ? styles.colTeam : i === STANDINGS_HEAD.length - 1 ? styles.colPoints : undefined}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Yükleniyor görünümü — gerçek tabloyla AYNI yapı (başlık + sezon seçici + thead + satır başına aynı hücreler), yalnız
 * içerik yer tutucu: veri gelince yükseklik değişmez (lig değiştirince altındaki öğeler kaymaz). `rows` beklenen
 * satır sayısı (çağıran bilir: o ligin son tablosu ya da lig tipine göre varsayılan).
 */
function StandingsLoading({
  variant,
  competitionName,
  rows,
  withSeasonSelect,
  hideTitle,
}: {
  variant: MatchCompetitionStandingsVariant;
  competitionName: string;
  rows: number;
  withSeasonSelect: boolean;
  hideTitle?: boolean;
}) {
  return (
    <section className={blockClass(variant)} aria-busy="true">
      <div className={titleBarClass(hideTitle)}>
        {hideTitle ? null : <h2 className={styles.title}>{competitionName}</h2>}
        {withSeasonSelect ? (
          <SeasonSelect
            seasons={[{ id: 0, name: "\u00a0" }]}
            value={0}
            onChange={() => {}}
            disabled
            dark={variant === "worldCup"}
            selectClassName={variant === "worldCup" ? styles.seasonSelectWorldCup : styles.seasonSelect}
          />
        ) : null}
      </div>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <StandingsHead />
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} aria-hidden>
                <td className={styles.colRank}>{"\u00a0"}</td>
                <td className={styles.colTeam}>
                  <div className={styles.teamCell}>
                    <span className={`${styles.teamLogo} ${styles.placeholder}`} />
                    <span className={`${styles.teamLink} ${styles.placeholderText}`}>{"\u00a0"}</span>
                  </div>
                </td>
                {STANDINGS_HEAD.slice(2).map((h) => (
                  <td key={h} className={h === "P" ? styles.colPoints : undefined}>
                    {"\u00a0"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StandingsTable({
  standings,
  competitionId,
  homeTeamId,
  awayTeamId,
}: {
  standings: CompetitionTableStandingRow[];
  competitionId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
}) {
  if (!standings.length) return null;

  const total = standings.length;

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <StandingsHead />
        <tbody>
          {standings.map((row, i) => {
            const tid = standingTeamId(row);
            const highlight =
              tid != null && (tid === homeTeamId || tid === awayTeamId);
            const logo = standingTeamLogo(row);
            const zone = getStandingRankZone(row.rank, total, competitionId);
            return (
              <tr
                key={`${tid ?? i}-${row.rank}`}
                className={highlight ? styles.rowHighlight : undefined}
              >
                <td
                  className={`${styles.colRank} ${standingsRankZoneClass(zone) ?? ""}`.trim()}
                >
                  {row.rank}
                </td>
                <td className={styles.colTeam}>
                  {tid != null ? (
                    <div className={styles.teamCell}>
                      {logo ? (
                        <TeamLogo
                          src={logo}
                          alt=""
                          className={styles.teamLogo}
                          width={16}
                          height={16}
                        />
                      ) : null}
                      <Link
                        href={`/teams/${tid}`}
                        className={styles.teamLink}
                        prefetch={false}
                        title={standingTeamFullName(row)}
                        aria-label={standingTeamFullName(row)}
                      >
                        <StandingTeamName row={row} />
                      </Link>
                    </div>
                  ) : (
                    <span title={standingTeamFullName(row)}>
                      <StandingTeamName row={row} />
                    </span>
                  )}
                </td>
                <td>{row.matches}</td>
                <td>{row.won}</td>
                <td>{row.drawn}</td>
                <td>{row.lost}</td>
                <td>{row.goals_scored ?? "—"}</td>
                <td>{row.goals_conceded ?? "—"}</td>
                <td>{row.goal_diff}</td>
                <td className={styles.colPoints}>{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export type MatchCompetitionStandingsVariant = "default" | "worldCup";

interface MatchCompetitionStandingsProps {
  data: CompetitionTableData | null;
  loading?: boolean;
  competitionName?: string;
  homeTeamId?: number;
  awayTeamId?: number;
  /** `worldCup`: koyu arka plan (yalnızca World Cup sayfası) */
  variant?: MatchCompetitionStandingsVariant;
  seasons?: SeasonListItem[];
  selectedSeasonId?: number | null;
  /** Promise dönerse beklerken tablo kutusunun içinde 04 · Puan tablosu animasyonu (tablo yerinde kalır). */
  onSeasonChange?: (id: number) => void | Promise<unknown>;
  /**
   * Verilirse yükleniyor görünümü gerçek tablo yapısında bu kadar satırla çizilir (kayma yok); verilmezse eski iskelet.
   */
  loadingRows?: number;
  /**
   * Lig adı başlığı çizilmez, sezon seçici tek başına kalır (ana sayfa yan paneli: lig adı üstteki lig seçicide zaten
   * görünür). Takım sayfası vb. başlığı korur.
   */
  hideTitle?: boolean;
}

/** Başlık satırı: başlıksız modda sezon seçici solda tek başına (yükseklik sabit — yükleniyor / veri aynı). */
function titleBarClass(hideTitle?: boolean): string {
  return hideTitle ? `${styles.titleContainer} ${styles.titleContainerSolo}` : styles.titleContainer;
}

function blockClass(variant: MatchCompetitionStandingsVariant): string {
  if (variant === "worldCup") {
    return `${styles.block} ${styles.blockWorldCup}`.trim();
  }
  return styles.block;
}

export default function MatchCompetitionStandings({
  data,
  loading,
  competitionName,
  homeTeamId,
  awayTeamId,
  variant = "default",
  seasons,
  selectedSeasonId,
  onSeasonChange,
  loadingRows,
  hideTitle,
}: MatchCompetitionStandingsProps) {
  const { t } = useTranslation("match");
  const [seasonChanging, setSeasonChanging] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const changeSeason = useCallback(
    (id: number) => {
      const result = onSeasonChange?.(id);
      if (!result || typeof result.then !== "function") return;
      setSeasonChanging(true);
      result.then(
        () => mounted.current && setSeasonChanging(false),
        () => mounted.current && setSeasonChanging(false),
      );
    },
    [onSeasonChange],
  );

  if (loading && loadingRows) {
    return (
      <StandingsLoading
        variant={variant}
        competitionName={competitionName || t("standings.fallbackName")}
        rows={loadingRows}
        withSeasonSelect={Boolean(onSeasonChange)}
        hideTitle={hideTitle}
      />
    );
  }

  if (loading) {
    return (
      <div className={blockClass(variant)}>
        <StandingsSkeleton variant={variant === 'worldCup' ? 'dark' : 'default'} />
      </div>
    );
  }

  if (!data) {
    return (
      <section className={blockClass(variant)} aria-label={t("standings.ariaLabel")}>
        {hideTitle ? null : <h2 className={styles.title}>{competitionName || t("standings.fallbackName")}</h2>}
        <EmptyState className={styles.emptyState}>{t("standings.empty")}</EmptyState>
      </section>
    );
  }

  const compName = data.competition?.name || competitionName || t("standings.fallbackName");
  const competitionId = data.competition?.id;
  const season = data.season;
  const showSeasonSelect = Boolean(seasons?.length && onSeasonChange);

  const legacyTable = Array.isArray(data.table) ? data.table : null;
  const hasStageStandings = data.stages?.some((s) =>
    s.groups?.some((g) => (g.standings?.length ?? 0) > 0),
  );
  const hasAnyRows =
    (legacyTable?.length ?? 0) > 0 || Boolean(hasStageStandings);

  return (
    <section className={blockClass(variant)} aria-label={t("standings.ariaLabel")}>
      <div className={titleBarClass(hideTitle)}>
        {hideTitle ? null : <h2 className={styles.title}>{compName}</h2>}
        {showSeasonSelect ? (
          <SeasonSelect
            seasons={seasons!}
            value={selectedSeasonId ?? null}
            onChange={changeSeason}
            dark={variant === "worldCup"}
            selectClassName={
              variant === "worldCup" ? styles.seasonSelectWorldCup : styles.seasonSelect
            }
          />
        ) : season?.name ? (
          <p className={styles.season}>
            {t("season.withValue", { season: formatSeasonLabel(season.name) })}
          </p>
        ) : null}
      </div>

      <div className={styles.tableArea} aria-busy={seasonChanging || undefined}>
        {legacyTable?.length ? (
          <StandingsTable
            standings={legacyTable as CompetitionTableStandingRow[]}
            competitionId={competitionId}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
          />
        ) : null}

        {data.stages?.map((stageBlock, si) => (
          <div key={stageBlock.stage?.id ?? si}>
            {data.stages!.length > 1 && stageBlock.stage?.name ? (
              <h3 className={styles.subheading}>{stageBlock.stage.name}</h3>
            ) : null}
            {(variant === "worldCup"
              ? sortWorldCupGroupsByName(stageBlock.groups ?? [])
              : stageBlock.groups ?? []
            ).map((group, gi) => (
              <div key={group.id ?? `${si}-${gi}`}>
                {(variant === "worldCup"
                  ? sortWorldCupGroupsByName(stageBlock.groups ?? [])
                  : stageBlock.groups ?? []
                ).length > 1 && group.name ? (
                  <h3 className={styles.subheading}>{standingsGroupHeading(group.name, t)}</h3>
                ) : null}
                {group.standings?.length ? (
                  <StandingsTable
                    standings={group.standings}
                    competitionId={competitionId}
                    homeTeamId={homeTeamId}
                    awayTeamId={awayTeamId}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {!hasAnyRows ? (
          <EmptyState className={styles.emptyState}>{t("standings.empty")}</EmptyState>
        ) : null}
        {seasonChanging ? <LazyLoad load={loadStandingsShuffle} props={{ label: t("common:loading") }} /> : null}
      </div>
    </section>
  );
}
