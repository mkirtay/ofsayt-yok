import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  CompetitionTableData,
  CompetitionTableStandingRow,
  SeasonListItem,
} from "@/services/liveScoreService";
import type { Match } from "@/models/liveScore";
import SeasonSelect from "@/components/SeasonSelect";
import { standingsGroupHeading } from "./groupHeading";
import { useI18n, useTranslation } from "@/lib/i18n";
import { formatSeasonLabel } from "@/utils/seasonLabel";
import { getStandingRankZone, type StandingsZoneKind } from "@/config/standingsZones";
import { standingTeamFullName, standingTeamShortCode } from "@/utils/standingsTeamLabel";
import { liveMinuteLabel } from "@/utils/liveMinute";
import { buildMatchHref } from "@/utils/matchUrl";
import EmptyState from "@/components/EmptyState";
import LazyLoad from "@/components/LazyLoad";
import { StandingsSkeleton } from "@/components/Skeleton";
import LoadError from "@/components/LoadError";
import styles from "./matchCompetitionStandings.module.scss";
import TeamLogo from '@/components/TeamLogo';
import {
  applyLiveStandings,
  baseDisplayRows,
  fixtureScore,
  type LiveDisplayRow,
  type LiveTableResult,
} from "@/services/liveStandings";
import { isLiveStandingsStale, type LiveStandingsState } from "@/hooks/useLiveStandings";
import { useCellFlash, useNow, useRowReorderAnimation } from "./useStandingsMotion";

// Yalnız sezon değişirken gerekir: animasyon ve CSS'i ayrı parçada (ana sayfanın ilk yüküne girmez).
const loadStandingsShuffle = () => import("./StandingsShuffle");

type Row = CompetitionTableStandingRow;
type DisplayRow = LiveDisplayRow<Row, Match>;
type Translate = (key: string, opts?: Record<string, unknown>) => string;

function standingTeamLogo(s: Row): string | undefined {
  return s.team?.logo || s.logo;
}

/**
 * İstatistik sütunları. `opt` olanlar (G/B/M/A/Y + form) dar kapta (< 440 px: ana sayfa yan paneli, maç sayfası sağ
 * sütunu, telefon) "Özet" görünümünde gizlenir, "Detaylar" ile açılır — veri kaybolmaz, yalnız öncelik değişir. Dar
 * görünümün önceliği: sıra/değişim, takım, O, Av, P.
 */
const STAT_COLS = [
  { key: "matches", label: "colPlayed", title: "colPlayedTitle", opt: false },
  { key: "won", label: "colWon", title: "colWonTitle", opt: true },
  { key: "drawn", label: "colDrawn", title: "colDrawnTitle", opt: true },
  { key: "lost", label: "colLost", title: "colLostTitle", opt: true },
  { key: "goalsFor", label: "colFor", title: "colForTitle", opt: true },
  { key: "goalsAgainst", label: "colAgainst", title: "colAgainstTitle", opt: true },
  { key: "goalDiff", label: "colDiff", title: "colDiffTitle", opt: false },
] as const;

const ZONE_ORDER: StandingsZoneKind[] = [
  "ucl",
  "ucl_qual",
  "europa",
  "conference_qual",
  "promotion",
  "playoff",
  "uefa_league_playoff",
  "relegation",
];
const ZONE_LEGEND_KEYS: Record<StandingsZoneKind, string> = {
  ucl: "standings.zoneUcl",
  ucl_qual: "standings.zoneUclQual",
  europa: "standings.zoneEuropa",
  conference_qual: "standings.zoneConference",
  promotion: "standings.zonePromotion",
  playoff: "standings.zonePlayoff",
  uefa_league_playoff: "standings.zoneUefaPlayoff",
  relegation: "standings.zoneRelegation",
};

type FormResult = "W" | "D" | "L";

/** Tabloda en az bir satırın lig formu var mı (yoksa sütun hiç çizilmez: eski önbellek / formsuz istek). */
function tableHasForm(rows: readonly Row[]): boolean {
  return rows.some((r) => (r.form?.length ?? 0) > 0);
}

/**
 * "Lig formu" başlığı — geniş kapta tam etiket, dar kapta "Form"; ikisi de aynı title ile.
 * MatchCard / H2H'teki tüm turnuvalı "Son 5 maç"tan ayrı: yalnız bu ligin maçları (standings `form` include'u).
 */
function FormHead() {
  const { t } = useTranslation("match");
  return (
    <th className={`${styles.colForm} ${styles.colOpt}`} title={t("standings.formTitle")} scope="col">
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

function StandingsHead({
  withForm = false,
  withMove = false,
  details = false,
  onToggleDetails,
}: {
  withForm?: boolean;
  withMove?: boolean;
  details?: boolean;
  onToggleDetails?: () => void;
}) {
  const { t } = useTranslation("match");
  return (
    <thead>
      <tr>
        <th className={styles.colRank} scope="col">
          {t("standings.colRank")}
        </th>
        {withMove ? (
          <th className={styles.colMove} scope="col" title={t("standings.colMove")}>
            <span className={styles.srOnly}>{t("standings.colMove")}</span>
          </th>
        ) : null}
        <th className={styles.colTeam} scope="col">
          <span className={styles.teamHead}>
            <span className={styles.teamHeadLabel}>{t("standings.colTeam")}</span>
            {/* Yalnız dar kapta görünür (CSS); geniş kapta bütün sütunlar zaten açık. */}
            <button
              type="button"
              className={styles.detailsToggle}
              aria-pressed={details}
              title={t(details ? "standings.summaryTitle" : "standings.detailsTitle")}
              onClick={onToggleDetails}
              disabled={!onToggleDetails}
            >
              {t(details ? "standings.summary" : "standings.details")}
            </button>
          </span>
        </th>
        {STAT_COLS.map((c) => (
          <th key={c.key} className={c.opt ? styles.colOpt : undefined} scope="col" title={t(`standings.${c.title}`)}>
            <span aria-hidden="true">{t(`standings.${c.label}`)}</span>
            <span className={styles.srOnly}>{t(`standings.${c.title}`)}</span>
          </th>
        ))}
        {withForm ? <FormHead /> : null}
        <th className={styles.colPoints} scope="col" title={t("standings.colPointsTitle")}>
          <span aria-hidden="true">{t("standings.colPoints")}</span>
          <span className={styles.srOnly}>{t("standings.colPointsTitle")}</span>
        </th>
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
            seasons={[{ id: 0, name: " " }]}
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
                <td className={styles.colRank}>{" "}</td>
                <td className={styles.colTeam}>
                  <div className={styles.teamCell}>
                    <span className={`${styles.teamLogo} ${styles.placeholder}`} />
                    <span className={`${styles.teamLink} ${styles.placeholderText}`}>{" "}</span>
                  </div>
                </td>
                {STAT_COLS.map((c) => (
                  <td key={c.key} className={c.opt ? styles.colOpt : undefined}>{" "}</td>
                ))}
                <td className={`${styles.colForm} ${styles.colOpt}`}>{" "}</td>
                <td className={styles.colPoints}>{" "}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </section>
  );
}

/** Canlı maçın dakikası / devre durumu (sağlayıcının verdiği; yoksa boş — uydurulmaz). */
function matchClock(m: Match, t: Translate): string {
  if (String(m.status).toUpperCase() === "HALF TIME BREAK") return t("halfTime");
  return liveMinuteLabel(m.time);
}

/** Takım adının altında küçük canlı maç satırı: "3–3 ÇRS · 71'" (takımın gözünden skor). */
function LiveLine({ row, opponentLabel, opponentName }: { row: DisplayRow; opponentLabel: string; opponentName: string }) {
  const { t } = useTranslation("match");
  const fx = row.fixture!;
  const clock = matchClock(fx.fixture, t);
  const score = fx.goalsFor != null && fx.goalsAgainst != null ? `${fx.goalsFor}–${fx.goalsAgainst}` : "";
  return (
    <span className={styles.liveLine}>
      <i className={styles.liveDot} aria-hidden="true" />
      <span aria-hidden="true" className={styles.liveText}>
        {score ? <b className={styles.liveScore}>{score}</b> : null}
        {score && opponentLabel ? " " : null}
        {opponentLabel}
        {clock ? <span className={styles.liveClock}>{` · ${clock}`}</span> : null}
      </span>
      <span className={styles.srOnly}>
        {t("standings.liveLine", { opponent: opponentName || opponentLabel, score: score || "—", minute: clock || "—" })}
      </span>
    </span>
  );
}

function StandingsTable({
  result,
  competitionId,
  homeTeamId,
  awayTeamId,
  favoriteTeamIds,
  details,
  onToggleDetails,
}: {
  result: LiveTableResult<Row, Match>;
  competitionId?: number;
  homeTeamId?: number;
  awayTeamId?: number;
  favoriteTeamIds?: readonly number[];
  details: boolean;
  onToggleDetails: () => void;
}) {
  const { t } = useTranslation("match");
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  useRowReorderAnimation(tbodyRef);
  useCellFlash(tbodyRef, result.live, styles.flash);

  const display = result.rows;
  if (!display.length) return null;
  const total = display.length;
  const withForm = tableHasForm(display.map((d) => d.row));
  const withMove = result.live;
  const byTeam = new Map(display.map((d) => [d.teamId, d.row]));

  return (
    <div className={styles.scroll}>
      <table className={`${styles.table} ${details ? styles.tableDetails : ""}`.trim()}>
        <StandingsHead withForm={withForm} withMove={withMove} details={details} onToggleDetails={onToggleDetails} />
        <tbody ref={tbodyRef}>
          {display.map((d, i) => {
            const { row, rank, points, rankDelta, pointsDelta, stats, fixture, teamId: tid } = d;
            const highlight = tid != null && (tid === homeTeamId || tid === awayTeamId);
            const favorite = tid != null && Boolean(favoriteTeamIds?.includes(tid));
            const logo = standingTeamLogo(row);
            const zone = getStandingRankZone(rank, total, competitionId);
            const fullName = standingTeamFullName(row);
            const code = standingTeamShortCode(row);
            let opponentLabel = "";
            let opponentName = "";
            if (fixture) {
              const opp = fixture.isHome ? fixture.fixture.away : fixture.fixture.home;
              const oppRow = fixture.opponentId != null ? byTeam.get(fixture.opponentId) : undefined;
              opponentName = (oppRow ? standingTeamFullName(oppRow) : "") || opp?.name || "";
              opponentLabel = (oppRow ? standingTeamShortCode(oppRow) : undefined) || opponentName;
            }
            const rowClass = [highlight ? styles.rowHighlight : "", fixture ? styles.rowLive : ""].filter(Boolean).join(" ");
            const moveText = rankDelta !== 0 ? t(rankDelta > 0 ? "standings.moveUp" : "standings.moveDown", { count: Math.abs(rankDelta) }) : "";
            const name = code ? (
              <>
                <span className={styles.nameFull}>{fullName}</span>
                <span className={styles.nameCode} aria-hidden="true" data-testid="team-short-code">
                  {code}
                </span>
              </>
            ) : (
              fullName
            );
            return (
              <tr key={tid ?? `${i}-${row.rank}`} data-team={tid ?? undefined} className={rowClass || undefined}>
                <td className={styles.colRank} data-zone={zone ?? undefined}>
                  {rank}
                </td>
                {withMove ? (
                  <td className={styles.colMove}>
                    {rankDelta !== 0 ? (
                      <span className={styles.move} data-move={rankDelta > 0 ? "up" : "down"} title={moveText}>
                        <span aria-hidden="true">{`${rankDelta > 0 ? "↑" : "↓"} ${Math.abs(rankDelta)}`}</span>
                        <span className={styles.srOnly}>{moveText}</span>
                      </span>
                    ) : null}
                  </td>
                ) : null}
                <td className={styles.colTeam}>
                  <div className={styles.teamCell}>
                    {logo ? (
                      <TeamLogo src={logo} alt="" className={styles.teamLogo} width={16} height={16} />
                    ) : null}
                    <div className={styles.teamText}>
                      <span className={styles.nameRow}>
                        {tid != null ? (
                          <Link
                            href={`/teams/${tid}`}
                            className={styles.teamLink}
                            prefetch={false}
                            title={fullName}
                            aria-label={fullName}
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className={styles.teamLink} title={fullName}>
                            {name}
                          </span>
                        )}
                        {favorite ? (
                          <span className={styles.favorite} role="img" aria-label={t("standings.favorite")} title={t("standings.favorite")}>
                            ★
                          </span>
                        ) : null}
                      </span>
                      {fixture ? <LiveLine row={d} opponentLabel={opponentLabel} opponentName={opponentName} /> : null}
                    </div>
                  </div>
                </td>
                {STAT_COLS.map((c) => {
                  const v = stats[c.key];
                  return (
                    <td key={c.key} className={c.opt ? styles.colOpt : undefined}>
                      <span className={styles.cellValue} data-flash={`${tid}:${c.key}`} data-flash-value={String(v ?? "")}>
                        {v ?? "—"}
                      </span>
                    </td>
                  );
                })}
                {withForm ? (
                  <td className={`${styles.colForm} ${styles.colOpt}`}>{row.form?.length ? <FormDots form={row.form} /> : null}</td>
                ) : null}
                <td className={styles.colPoints}>
                  <span className={styles.pointsValue} data-flash={`${tid}:points`} data-flash-value={String(points)}>
                    {points}
                  </span>
                  {/* Canlı tabloda her satırda aynı genişlikte yuva: puanlar alt alta hizalı kalır. */}
                  {result.live ? (
                    <span className={styles.pointsDelta} title={pointsDelta > 0 ? t("standings.pointsBefore", { points: points - pointsDelta }) : undefined}>
                      {pointsDelta > 0 ? (
                        <>
                          <span aria-hidden="true">{`+${pointsDelta}`}</span>
                          <span className={styles.srOnly}>{t("standings.pointsGain", { count: pointsDelta })}</span>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Başlık altı canlı durum: "Canlı puan durumu" + açıklama; güncelleme kesildiyse dürüst "son güncelleme" notu; canlı maç
 * kalmadı ama resmî tablo biten maçı henüz saymadıysa "Puan durumu (resmî tablo güncelleniyor)".
 */
function LiveStatus({ mode, updatedAt }: { mode: "live" | "stale" | "settling"; updatedAt: number }) {
  const { t } = useTranslation("match");
  const { locale } = useI18n();
  if (mode === "settling") {
    return (
      <div className={styles.liveStatus} data-settling="true">
        <p className={styles.liveHeading}>
          {t("standings.settlingHeading")} <span className={styles.liveHeadingNote}>{t("standings.settlingNote")}</span>
        </p>
      </div>
    );
  }
  if (mode === "stale") {
    const time = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Istanbul",
    }).format(updatedAt);
    return (
      <div className={styles.liveStatus} data-stale="true">
        <p className={styles.liveHeading}>{t("standings.staleHeading")}</p>
        <p className={styles.liveNote}>{t("standings.staleNote", { time })}</p>
      </div>
    );
  }
  return (
    <div className={styles.liveStatus}>
      <p className={styles.liveHeading}>
        <i className={styles.livePulse} aria-hidden="true" />
        {t("standings.liveHeading")}
      </p>
      <p className={styles.liveNote}>{t("standings.liveNote")}</p>
    </div>
  );
}

/** Tabloyu etkileyen canlı maçların tek satırlık, yatay kayan skor şeridi; maça tıklanınca maç sayfası. */
function LiveStrip({
  matches,
  codeOf,
  currentMatchId,
}: {
  matches: Match[];
  codeOf: (id: number | undefined, name: string) => string;
  currentMatchId?: number;
}) {
  const { t } = useTranslation("match");
  if (!matches.length) return null;
  return (
    <ul className={styles.strip} aria-label={t("standings.stripLabel")}>
      {matches.map((m) => {
        const s = fixtureScore(m);
        const score = s ? `${s[0]}–${s[1]}` : "–";
        const clock = matchClock(m, t);
        const homeName = m.home?.name ?? "";
        const awayName = m.away?.name ?? "";
        const label = t("standings.stripMatch", { home: homeName, away: awayName, score, minute: clock || "—" });
        return (
          <li key={m.id}>
            <Link
              href={buildMatchHref(m)}
              prefetch={false}
              className={styles.stripMatch}
              aria-label={label}
              title={label}
              aria-current={currentMatchId != null && Number(m.id) === currentMatchId ? "page" : undefined}
            >
              {clock ? <span className={styles.stripClock}>{clock}</span> : null}
              <span className={styles.stripTeam}>
                <TeamLogo src={m.home?.logo} alt="" className={styles.stripLogo} width={14} height={14} />
                {codeOf(m.home?.id, homeName)}
              </span>
              <b className={styles.stripScore}>{score}</b>
              <span className={styles.stripTeam}>
                {codeOf(m.away?.id, awayName)}
                <TeamLogo src={m.away?.logo} alt="" className={styles.stripLogo} width={14} height={14} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Sıra şeridi renklerinin açıklaması — yalnız tabloda görünen bölgeler (lig kuralları: config/standingsZones). */
function Legend({ zones }: { zones: StandingsZoneKind[] }) {
  const { t } = useTranslation("match");
  if (!zones.length) return null;
  return (
    <ul className={styles.legend} aria-label={t("standings.legendLabel")}>
      {zones.map((z) => (
        <li key={z}>
          <i className={styles.legendSwatch} data-zone={z} aria-hidden="true" />
          {t(ZONE_LEGEND_KEYS[z])}
        </li>
      ))}
    </ul>
  );
}

interface MatchCompetitionStandingsProps {
  data: CompetitionTableData | null;
  loading?: boolean;
  competitionName?: string;
  /** Başlıkta lig adının solunda (verilirse). */
  competitionLogo?: string | null;
  homeTeamId?: number;
  awayTeamId?: number;
  /** Favori takımlar: satırda küçük yıldız (ana sayfa favorileri). */
  favoriteTeamIds?: readonly number[];
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
   * Canlı puan durumu katmanı (`useLiveStandings`; yalnız ligde canlı maç varken dolu). Sıra + puan sağlayıcının canlı
   * tablosundan, fark maç öncesi (normal) tabloya göre. Sezon uyuşmazsa / eksikse normal tablo.
   */
  live?: LiveStandingsState | null;
  /**
   * Ligin şu an oynanan maçları (canlı liste). Verilirse: skor şeridi, takım altında skor/dakika, doğrulanmış skorla
   * O/G/B/M/Av; tabloyu etkileyen maç yoksa canlı katman gösterilmez. Verilmezse yalnız sıra + puan bindirilir.
   */
  liveMatches?: readonly Match[];
  /** Maç sayfası: şeritte bu maç işaretlenir. */
  currentMatchId?: number;
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

type TableBlock = { key: string; headings: string[]; result: LiveTableResult<Row, Match> };
type Verified = ReadonlyMap<string, [number, number]>;

/** Doğrulanmış skorlar: yeni hesaplananlar öncekilerin üstüne; artık canlı olmayan maçlar düşer. */
function mergeVerified(prev: Verified, blocks: readonly TableBlock[], liveIds: ReadonlySet<string>): Map<string, [number, number]> {
  const next = new Map<string, [number, number]>();
  for (const [k, v] of prev) if (liveIds.has(k)) next.set(k, v);
  for (const b of blocks) for (const [k, v] of b.result.verified) next.set(k, v);
  return next;
}

function sameVerified(a: Verified, b: Verified): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (!w || w[0] !== v[0] || w[1] !== v[1]) return false;
  }
  return true;
}

const plainTable = (rows: Row[]): LiveTableResult<Row, Match> => ({
  rows: baseDisplayRows(rows),
  live: false,
  fixtures: [],
  settling: false,
  verified: new Map(),
});

/** Tek tablo ya da aşama/grup tabloları; her birine (varsa) canlı katman. */
function buildBlocks(
  data: CompetitionTableData,
  t: Translate,
  live: LiveStandingsState | null,
  liveMatches: readonly Match[] | undefined,
  verified: Verified,
): TableBlock[] {
  const seasonId = data.season?.id;
  const build = (rows: Row[], stageId?: number): LiveTableResult<Row, Match> => {
    if (!live) return plainTable(rows);
    const r = applyLiveStandings<Row, Match>(rows, live.data, { seasonId, stageId, fixtures: liveMatches, verified });
    // Canlı liste biliniyor ama bu tabloyu etkileyen maç yok → normal tablo; yalnız biten maçın sonucu resmî tabloya
    // henüz işlenmediyse (settling) sağlayıcının tablosu kalır.
    return r.live && liveMatches && r.fixtures.length === 0 && !r.settling ? plainTable(rows) : r;
  };
  const blocks: TableBlock[] = [];
  if (Array.isArray(data.table) && data.table.length) blocks.push({ key: "table", headings: [], result: build(data.table) });
  const stages = data.stages ?? [];
  stages.forEach((stageBlock, si) => {
    const groups = stageBlock.groups ?? [];
    let stageHeading = stages.length > 1 ? stageBlock.stage?.name : undefined;
    groups.forEach((group, gi) => {
      if (!group.standings?.length) return;
      const headings = [stageHeading, groups.length > 1 && group.name ? standingsGroupHeading(group.name, t) : undefined].filter(
        (h): h is string => Boolean(h),
      );
      stageHeading = undefined;
      blocks.push({ key: `${stageBlock.stage?.id ?? si}-${group.id ?? gi}`, headings, result: build(group.standings, stageBlock.stage?.id) });
    });
  });
  return blocks;
}

export default function MatchCompetitionStandings({
  data,
  loading,
  competitionName,
  competitionLogo,
  homeTeamId,
  awayTeamId,
  favoriteTeamIds,
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
  liveMatches,
  currentMatchId,
}: MatchCompetitionStandingsProps) {
  const { t } = useTranslation("match");
  const [seasonChanging, setSeasonChanging] = useState(false);
  const [details, setDetails] = useState(false);
  const toggleDetails = useCallback(() => setDetails((v) => !v), []);
  // Gol sonrası sağlayıcı canlı tabloyu ~1 dk geç işleyebilir: o arada son doğrulanmış skor kullanılır.
  const [verified, setVerified] = useState<Verified>(() => new Map());
  const now = useNow(live != null);
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

  const blocks = data ? buildBlocks(data, t, live, liveMatches, verified) : [];
  const nextVerified = mergeVerified(verified, blocks, new Set((liveMatches ?? []).map((m) => String(m.id))));
  // Önceki çizimden bilgi saklama (React "storing information from previous renders" deseni); ikinci geçişte aynı
  // harita çıkar, döngü olmaz.
  if (!sameVerified(verified, nextVerified)) setVerified(nextVerified);

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

  const liveApplied = blocks.some((b) => b.result.live);
  // Canlı maç yoksa yalnız biten maçın sonucu bekleniyor: skorlar kesin, "bağlantı kesildi" notu anlamsız.
  const inPlay = blocks.some((b) => b.result.fixtures.length > 0) || !liveMatches;
  const stale = live != null && liveApplied && inPlay && isLiveStandingsStale(live, now);
  const liveMode = !inPlay ? "settling" : stale ? "stale" : "live";
  const stripMatches: Match[] = [];
  const codeById = new Map<number, string>();
  const zoneSet = new Set<StandingsZoneKind>();
  for (const b of blocks) {
    for (const f of b.result.fixtures) if (!stripMatches.some((m) => m.id === f.id)) stripMatches.push(f);
    const total = b.result.rows.length;
    for (const d of b.result.rows) {
      const code = standingTeamShortCode(d.row);
      if (d.teamId != null && code) codeById.set(d.teamId, code);
      const zone = getStandingRankZone(d.rank, total, competitionId);
      if (zone) zoneSet.add(zone);
    }
  }
  const zones = ZONE_ORDER.filter((z) => zoneSet.has(z));
  const codeOf = (id: number | undefined, name: string) => (id != null ? codeById.get(Number(id)) : undefined) || name;

  return (
    <section
      className={blockClass(contained)}
      aria-label={t("standings.ariaLabel")}
      data-live={liveApplied ? (liveMode === "live" ? "on" : liveMode) : undefined}
    >
      {hideHeader ? null : (
      <div className={styles.titleContainer}>
        <h2 className={styles.title}>
          {competitionLogo ? <TeamLogo src={competitionLogo} alt="" className={styles.titleLogo} width={18} height={18} /> : null}
          {compName}
        </h2>
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

      {liveApplied && live ? (
        <div className={styles.liveBar}>
          <LiveStatus mode={liveMode} updatedAt={live.updatedAt} />
          <LiveStrip matches={stripMatches} codeOf={codeOf} currentMatchId={currentMatchId} />
        </div>
      ) : null}

      <div ref={tableAreaRef} className={styles.tableArea} aria-busy={shuffling || undefined}>
        {blocks.map((b) => (
          <Fragment key={b.key}>
            {b.headings.map((h) => (
              <h3 key={h} className={styles.subheading}>
                {h}
              </h3>
            ))}
            <StandingsTable
              result={b.result}
              competitionId={competitionId}
              homeTeamId={homeTeamId}
              awayTeamId={awayTeamId}
              favoriteTeamIds={favoriteTeamIds}
              details={details}
              onToggleDetails={toggleDetails}
            />
          </Fragment>
        ))}
        {blocks.length ? <Legend zones={zones} /> : <EmptyState className={styles.emptyState}>{t("standings.empty")}</EmptyState>}
        {seasonChanging || seasonBusy ? <LazyLoad load={loadStandingsShuffle} props={{ label: t("common:loading") }} /> : null}
      </div>
    </section>
  );
}
