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
import { standingsRankZoneClass } from "@/utils/standingsRankZoneUi";
import { standingTeamFullName } from "@/utils/standingsTeamLabel";
import EmptyState from "@/components/EmptyState";
import LazyLoad from "@/components/LazyLoad";
import StandingTeamName from "@/components/StandingTeamName";
import { StandingsSkeleton } from "@/components/Skeleton";
import LoadError from "@/components/LoadError";
import styles from "./matchCompetitionStandings.module.scss";
import TeamLogo from '@/components/TeamLogo';
import { applyLiveStandings, type LiveStandingsData } from "@/services/liveStandings";

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

type FormResult = "W" | "D" | "L";

/** Tabloda en az bir satırın lig formu var mı (yoksa sütun hiç çizilmez: eski önbellek / formsuz istek). */
function tableHasForm(rows: readonly CompetitionTableStandingRow[]): boolean {
  return rows.some((r) => (r.form?.length ?? 0) > 0);
}

/**
 * "Lig formu" başlığı — geniş kapta tam etiket, dar kapta (yan panel, < 400 px) "Form"; ikisi de aynı title ile.
 * MatchCard / H2H'teki tüm turnuvalı "Son 5 maç"tan ayrı: yalnız bu ligin maçları (standings `form` include'u).
 */
function FormHead() {
  const { t } = useTranslation("match");
  return (
    <th className={styles.colForm} title={t("standings.formTitle")}>
      <span className={styles.formHeadFull}>{t("standings.formHead")}</span>
      <span className={styles.formHeadShort} aria-hidden="true">
        {t("standings.formHeadShort")}
      </span>
    </th>
  );
}

/** Son 5 lig maçı, eskiden yeniye (soldan sağa) küçük G/B/M noktaları. */
function FormDots({ form }: { form: readonly FormResult[] }) {
  const { t } = useTranslation("match");
  const label = { W: t("standings.formWin"), D: t("standings.formDraw"), L: t("standings.formLoss") } as const;
  return (
    <span className={styles.formDots} role="img" aria-label={t("standings.formAria", { list: form.map((f) => label[f]).join(", ") })}>
      {form.map((f, i) => (
        <i key={i} className={`${styles.dot} ${f === "W" ? styles.dotW : f === "D" ? styles.dotD : styles.dotL}`} />
      ))}
    </span>
  );
}

/**
 * Canlı katman açıkken "Takım" başlığının yerine "Canlı" rozeti (tam ad ekran okuyucuda). Başlık satırında: tablo
 * üstüne yeni satır eklenmez (veri sonradan gelir, kayma olmaz), takım sütunu genişlemez.
 */
function LiveTeamHead() {
  const { t } = useTranslation("match");
  return (
    <>
      <span className={styles.liveBadge} title={t("standings.liveTitle")} aria-hidden="true">
        {t("standings.liveBadge")}
      </span>
      <span className={styles.srOnly}>{`Takım · ${t("standings.liveTitle")}`}</span>
    </>
  );
}

function StandingsHead({ withForm = false, live = false }: { withForm?: boolean; live?: boolean }) {
  const last = STANDINGS_HEAD.length - 1;
  return (
    <thead>
      <tr>
        {STANDINGS_HEAD.map((h, i) => (
          <th
            key={h}
            className={i === 0 ? styles.colRank : i === 1 ? styles.colTeam : i === last ? styles.colPoints : undefined}
          >
            {i === 1 && live ? <LiveTeamHead /> : h}
          </th>
        )).flatMap((th, i) => (withForm && i === last ? [<FormHead key="form" />, th] : [th]))}
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
  competitionName,
  rows,
  withSeasonSelect,
  hideHeader,
  contained,
}: {
  competitionName: string;
  rows: number;
  withSeasonSelect: boolean;
  hideHeader?: boolean;
  contained?: boolean;
}) {
  return (
    <section className={blockClass(contained)} aria-busy="true">
      {hideHeader ? null : (
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>{competitionName}</h2>
        {withSeasonSelect ? (
          <SeasonSelect
            seasons={[{ id: 0, name: "\u00a0" }]}
            value={0}
            onChange={() => {}}
            disabled
            selectClassName={styles.seasonSelect}
          />
        ) : null}
      </div>
      )}
      <div className={styles.tableArea}>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <StandingsHead withForm />
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
                {STANDINGS_HEAD.slice(2, -1).map((h) => (
                  <td key={h}>{"\u00a0"}</td>
                ))}
                <td className={styles.colForm}>{"\u00a0"}</td>
                <td className={styles.colPoints}>{"\u00a0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}

function StandingsTable({
  standings,
  competitionId,
  homeTeamId,
  awayTeamId,
  live,
  seasonId,
  stageId,
}: {
  standings: CompetitionTableStandingRow[];
  competitionId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  /** Canlı puan durumu katmanı (yalnız ligde canlı maç varken); uygulanamazsa normal tablo. */
  live?: LiveStandingsData | null;
  seasonId?: number | string | null;
  stageId?: number | string | null;
}) {
  const { t } = useTranslation("match");
  if (!standings.length) return null;

  const total = standings.length;
  const withForm = tableHasForm(standings);
  const liveRows = live ? applyLiveStandings(standings, live, { seasonId, stageId }) : null;
  const display = liveRows ?? standings.map((row) => ({ row, rank: Number(row.rank), points: row.points, move: null, pointsChanged: false }));

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <StandingsHead withForm={withForm} live={liveRows != null} />
        <tbody>
          {display.map(({ row, rank, points, move, pointsChanged }, i) => {
            const tid = standingTeamId(row);
            const highlight =
              tid != null && (tid === homeTeamId || tid === awayTeamId);
            const logo = standingTeamLogo(row);
            const zone = getStandingRankZone(rank, total, competitionId);
            return (
              <tr
                key={tid ?? `${i}-${row.rank}`}
                className={highlight ? styles.rowHighlight : undefined}
              >
                <td
                  className={`${styles.colRank} ${standingsRankZoneClass(zone) ?? ""}`.trim()}
                  data-zone={move && standingsRankZoneClass(zone) ? zone ?? undefined : undefined}
                >
                  {rank}
                  {move ? (
                    <span className={styles.liveMove} data-move={move} title={t(move === "up" ? "standings.liveUp" : "standings.liveDown")}>
                      <span aria-hidden="true">{move === "up" ? "▲" : "▼"}</span>
                      <span className={styles.srOnly}>{t(move === "up" ? "standings.liveUp" : "standings.liveDown")}</span>
                    </span>
                  ) : null}
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
                {withForm ? (
                  <td className={styles.colForm}>{row.form?.length ? <FormDots form={row.form} /> : null}</td>
                ) : null}
                <td className={pointsChanged ? `${styles.colPoints} ${styles.livePoints}` : styles.colPoints}>{points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface MatchCompetitionStandingsProps {
  data: CompetitionTableData | null;
  loading?: boolean;
  competitionName?: string;
  homeTeamId?: number;
  awayTeamId?: number;
  seasons?: SeasonListItem[];
  selectedSeasonId?: number | null;
  /** Promise dönerse beklerken tablo kutusunun içinde 04 · Puan tablosu animasyonu (tablo yerinde kalır). */
  onSeasonChange?: (id: number) => void | Promise<unknown>;
  /**
   * Verilirse yükleniyor görünümü gerçek tablo yapısında bu kadar satırla çizilir (kayma yok); verilmezse eski iskelet.
   */
  loadingRows?: number;
  /**
   * Başlık satırı (lig adı + sezon seçici) çizilmez: ana sayfa yan panelinde lig adı ve sezon üstteki lig seçici
   * satırında (HubLeaguePicker). Takım sayfası vb. başlığı korur.
   */
  hideHeader?: boolean;
  /** Sezon dışarıdan değiştirilirken (yan panel seçicisi) tablo kutusunda karıştırma animasyonu. */
  seasonBusy?: boolean;
  /** Yüklenemedi (hata ≠ tablo yok): `data` yokken "yüklenemedi · tekrar dene". */
  error?: boolean;
  onRetry?: () => void;
  /**
   * Canlı puan durumu katmanı (`useLiveStandings`; yalnız ligde canlı maç varken dolu). Sıra + puan normal tablonun
   * üstüne bindirilir, sıra değişimi ▲/▼, başlıkta "Canlı" rozeti. Sezon uyuşmazsa / eksikse normal tablo.
   */
  live?: LiveStandingsData | null;
  /**
   * Ebeveynin yüksekliği sınırlı (ana sayfa yan paneli): tablo bölgesi kalan alanda kendi içinde kayar (iki eksen),
   * başlık satırı sticky. Satır sayısından bağımsız; tablo sığıyorsa doğal boyunda kalır (kaydırma çubuğu yok).
   * Verilmezse (puan durumu sayfası, maç / takım sayfası) davranış aynı: tablo sayfa akışında.
   */
  contained?: boolean;
}

function blockClass(contained = false): string {
  return contained ? `${styles.block} ${styles.blockContained}` : styles.block;
}

export default function MatchCompetitionStandings({
  data,
  loading,
  competitionName,
  homeTeamId,
  awayTeamId,
  seasons,
  selectedSeasonId,
  onSeasonChange,
  loadingRows,
  hideHeader,
  seasonBusy,
  contained = false,
  error = false,
  onRetry,
  live = null,
}: MatchCompetitionStandingsProps) {
  const { t } = useTranslation("match");
  const [seasonChanging, setSeasonChanging] = useState(false);
  // contained: sezon değişirken tablo bölgesi başa döner — 04 katmanı (absolute, inset 0) görünür alanı kaplasın.
  const tableAreaRef = useRef<HTMLDivElement>(null);
  const shuffling = seasonChanging || Boolean(seasonBusy);
  useEffect(() => {
    if (contained && shuffling && tableAreaRef.current) tableAreaRef.current.scrollTop = 0;
  }, [contained, shuffling]);
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
        competitionName={competitionName || t("standings.fallbackName")}
        rows={loadingRows}
        withSeasonSelect={Boolean(onSeasonChange)}
        hideHeader={hideHeader}
        contained={contained}
      />
    );
  }

  if (loading) {
    return (
      <div className={blockClass(contained)}>
        <StandingsSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <section className={blockClass(contained)} aria-label={t("standings.ariaLabel")}>
        {hideHeader ? null : <h2 className={styles.title}>{competitionName || t("standings.fallbackName")}</h2>}
        {error ? (
          <LoadError className={styles.emptyState} onRetry={onRetry} />
        ) : (
          <EmptyState className={styles.emptyState}>{t("standings.empty")}</EmptyState>
        )}
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
    <section className={blockClass(contained)} aria-label={t("standings.ariaLabel")}>
      {hideHeader ? null : (
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>{compName}</h2>
        {showSeasonSelect ? (
          <SeasonSelect
            seasons={seasons!}
            value={selectedSeasonId ?? null}
            onChange={changeSeason}
            selectClassName={styles.seasonSelect}
          />
        ) : season?.name ? (
          <p className={styles.season}>
            {t("season.withValue", { season: formatSeasonLabel(season.name) })}
          </p>
        ) : null}
      </div>
      )}

      <div ref={tableAreaRef} className={styles.tableArea} aria-busy={shuffling || undefined}>
        {legacyTable?.length ? (
          <StandingsTable
            standings={legacyTable as CompetitionTableStandingRow[]}
            competitionId={competitionId}
            homeTeamId={homeTeamId}
            awayTeamId={awayTeamId}
            live={live}
            seasonId={season?.id}
          />
        ) : null}

        {data.stages?.map((stageBlock, si) => (
          <div key={stageBlock.stage?.id ?? si}>
            {data.stages!.length > 1 && stageBlock.stage?.name ? (
              <h3 className={styles.subheading}>{stageBlock.stage.name}</h3>
            ) : null}
            {(stageBlock.groups ?? []).map((group, gi) => (
              <div key={group.id ?? `${si}-${gi}`}>
                {(stageBlock.groups ?? []).length > 1 && group.name ? (
                  <h3 className={styles.subheading}>{standingsGroupHeading(group.name, t)}</h3>
                ) : null}
                {group.standings?.length ? (
                  <StandingsTable
                    standings={group.standings}
                    competitionId={competitionId}
                    homeTeamId={homeTeamId}
                    awayTeamId={awayTeamId}
                    live={live}
                    seasonId={season?.id}
                    stageId={stageBlock.stage?.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
        {!hasAnyRows ? (
          <EmptyState className={styles.emptyState}>{t("standings.empty")}</EmptyState>
        ) : null}
        {seasonChanging || seasonBusy ? <LazyLoad load={loadStandingsShuffle} props={{ label: t("common:loading") }} /> : null}
      </div>
    </section>
  );
}
