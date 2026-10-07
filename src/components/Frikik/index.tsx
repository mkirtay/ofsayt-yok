import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useI18n, useTranslation } from "@/lib/i18n";
import "@/lib/i18nNamespaces/frikik";
import { webglAvailable } from "@/components/pitch3d/webgl";
import { LIVES, SIM_VERSION, type ShotResult } from "@/lib/frikik/sim";
import { dailySeed, dayLabel, turkeyDay } from "@/lib/frikik/daily";
import { sharePath, type ShareInfo } from "@/lib/frikik/share";
import { entryFromQuery, trackFrikik, type FrikikEntry } from "@/lib/frikik/analytics";
import { readPendingRun, writeLastRun, writePendingRun, type PendingRun } from "@/lib/frikik/localRun";
import { useFrikikBoard, type MyStanding } from "@/hooks/useFrikikBoard";
import Leaderboard from "./Leaderboard";
import type { FrikikHandle, FrikikSummary, RoundInfo } from "./frikikScene";
import styles from "./frikik.module.scss";

/** three.js sahnesi ayrı parça: sayfa yüklendikten sonra gelir (ilk yüke ve diğer sayfalara girmez). */
const loadScene = () => import("./frikikScene");

type Mode = "boot" | "reduced" | "nowebgl" | "game";
const TIP_SEEN_KEY = "oy_frikik_tip";
/** Pano reklam iletişim adresi (derlemede gömülür); tanımlı değilse satır hiç çizilmez (yer tutucu canlıya çıkmaz). */
const AD_CONTACT = process.env.NEXT_PUBLIC_FRIKIK_AD_CONTACT?.trim() || "";

/** Skor kaydı durumu (bitiş kartı): idle → sending → recorded | already (bugün yazılmış) | login (girişsiz) | nickname | error */
type Submit =
  | { state: "idle" }
  | { state: "sending" }
  | { state: "recorded"; standing: MyStanding; first: boolean }
  | { state: "login" }
  | { state: "nickname"; error: string | null }
  | { state: "error"; code: string };

/** Vuruş sonucunun kısa metni ("Doksan!", "Direkten gol", "Barajda kaldı" …). */
export function resultLabel(r: ShotResult, t: (key: string) => string): string {
  if (r.kind !== "goal") return t(`result.${r.kind}`);
  return r.corner
    ? t("result.corner")
    : r.viaPost
      ? t("result.viaPost")
      : t("result.goal");
}

/** Rüzgâr göstergesi: yön oku + 1–3 kademe (|rüzgâr| 0,8 m/sn² başına bir). */
export function windLevel(wind: number): number {
  return wind === 0 ? 0 : Math.min(3, Math.ceil(Math.abs(wind) / 0.8));
}

type ScoreResponse = { recorded: boolean; standing: MyStanding };

/** POST /api/frikik/score — sonuç ya da hata kodu (ağ hatası: NETWORK). */
async function postScore(run: PendingRun): Promise<{ ok: true; data: ScoreResponse } | { ok: false; code: string }> {
  try {
    const res = await fetch("/api/frikik/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(run),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<ScoreResponse> & { code?: string };
    if (res.ok && data.standing) return { ok: true, data: data as ScoreResponse };
    return { ok: false, code: data.code ?? (res.status === 401 ? "UNAUTHORIZED" : `HTTP_${res.status}`) };
  } catch {
    return { ok: false, code: "NETWORK" };
  }
}

/**
 * /frikik oyunu: Günün frikiği (seviye modu, 3 can) doğrudan açılır. HUD (seviye / can / rüzgâr / mesafe, puan,
 * sonuç), tek seferlik ipucu, bitiş kartı (tekrar oyna / paylaş / tabloya yaz) ve sahnenin yüklenmesi; altta Günlük /
 * Aylık puan durumu. Oyun döngüsü sahnede (frikikScene.ts); burası yalnız olayları gösterir.
 * Skor: oyun giriş istemez; tabloya yazmak için Google girişi. Bitişte vuruş GİRDİLERİ sunucuya gider, skoru sunucu
 * hesaplar; günün ilk bitmiş koşusu yazılır (sonrakiler serbest, tabloya girmez). Girişsiz oyuncuya "giriş yap"
 * teklifi; koşu tarayıcıda bekler, girişten sonra kendiliğinden gönderilir. "Hareketi azalt" açıksa oyun kendiliğinden
 * başlamaz (statik bilgilendirme, isteyen açar). Alan sabit yükseklikte → CLS yok.
 */
export default function Frikik({ shared }: { shared: ShareInfo | null }) {
  const { t } = useTranslation("frikik");
  const { locale } = useI18n();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const signedIn = sessionStatus === "authenticated" && !!session?.user;
  const langRef = useRef<"tr" | "en">("tr");
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FrikikHandle | null>(null);
  const [mode, setMode] = useState<Mode>("boot");
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<RoundInfo>({
    index: 0,
    level: 1,
    lives: LIVES,
    wind: 0,
    dist: 0,
  });
  const [results, setResults] = useState<ShotResult[]>([]);
  const [total, setTotal] = useState(0);
  const [day, setDay] = useState<number | null>(null);
  /** Tek seferlik "nasıl oynanır" ipucu (ilk açılışta; kapatılınca localStorage'a yazılır, bir daha çıkmaz). */
  const [tipOpen, setTipOpen] = useState(false);
  const [summary, setSummary] = useState<FrikikSummary | null>(null);
  const [shareNote, setShareNote] = useState("");
  const [submit, setSubmit] = useState<Submit>({ state: "idle" });
  const [nickname, setNickname] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  /** Girişten dönünce bekleyen koşunun yazıldığını söyleyen not. */
  const [resumeNote, setResumeNote] = useState<string | null>(null);
  const entryRef = useRef<FrikikEntry>("direct");
  const playsRef = useRef(0);
  const goalLabel = t("goal");
  const goalLabelRef = useRef(goalLabel);
  const { board, me, error: boardError, refresh: refreshBoard, setMe } = useFrikikBoard(mode !== "boot", signedIn);
  useEffect(() => {
    langRef.current = locale === "en" ? "en" : "tr";
  }, [locale]);

  useEffect(() => {
    goalLabelRef.current = goalLabel;
    sceneRef.current?.setGoalLabel(goalLabel);
  }, [goalLabel]);

  // Karar: hareketi azalt → bilgilendirme; WebGL yok → mesaj; aksi halde oyun.
  useEffect(() => {
    entryRef.current = entryFromQuery(new URLSearchParams(window.location.search).get("src"));
    const decide = () =>
      setMode(
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "reduced"
          : webglAvailable()
            ? "game"
            : "nowebgl",
      );
    if (document.readyState === "complete") decide();
    else {
      window.addEventListener("load", decide, { once: true });
      return () => window.removeEventListener("load", decide);
    }
  }, []);

  /** Günün frikiğini başlatır: günün tohumuyla (herkes aynı dizi). */
  const startGame = useCallback(() => {
    setSummary(null);
    setResults([]);
    setTotal(0);
    setShareNote("");
    setSubmit({ state: "idle" });
    const d = turkeyDay(Date.now());
    setDay(d);
    sceneRef.current?.start(dailySeed(d));
    trackFrikik("frikik_started", { entry: entryRef.current, again: playsRef.current > 0 });
    playsRef.current += 1;
  }, []);

  /** Koşuyu tabloya gönderir; sonuç kartta. `first`: bu oturumdaki ilk koşu (tekrar koşularda tablo zaten yazılmıştır). */
  const sendRun = useCallback(
    async (run: PendingRun, first: boolean) => {
      setSubmit({ state: "sending" });
      const r = await postScore(run);
      if (r.ok) {
        writePendingRun(null);
        setMe(r.data.standing);
        setSubmit({ state: "recorded", standing: r.data.standing, first });
        const today = r.data.standing.today;
        if (today) writeLastRun({ day: run.day, level: today.level, score: today.score, cleared: today.cleared, recorded: true, rank: today.rank });
        refreshBoard();
        return;
      }
      if (r.code === "NICKNAME_REQUIRED") setSubmit({ state: "nickname", error: null });
      else if (r.code === "UNAUTHORIZED") setSubmit({ state: "login" });
      else setSubmit({ state: "error", code: r.code });
    },
    [refreshBoard, setMe],
  );

  /** Koşu bitti: yerel sonuç + (girişliyse) kayıt, girişsize teklif. */
  const onFinish = useCallback(
    (s: FrikikSummary, d: number) => {
      const dayKey = dayLabel(d);
      const run: PendingRun = { day: dayKey, seed: s.seed, simVersion: SIM_VERSION, shots: s.inputs };
      trackFrikik("frikik_finished", { level: s.level, score: s.total, signedIn });
      writeLastRun({ day: dayKey, level: s.level, score: s.total, cleared: s.cleared, recorded: false });
      if (signedIn) void sendRun(run, true);
      else {
        writePendingRun(run);
        trackFrikik("frikik_login_prompt_shown", { level: s.level });
        setSubmit({ state: "login" });
      }
    },
    [sendRun, signedIn],
  );
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);
  const dayRef = useRef<number | null>(null);
  useEffect(() => {
    dayRef.current = day;
  }, [day]);

  // Girişten dönüş: tarayıcıda bekleyen (bugünkü) koşu varsa kendiliğinden gönderilir.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (!signedIn || resumedRef.current) return;
    const pending = readPendingRun(dayLabel(turkeyDay(Date.now())));
    if (!pending) return;
    resumedRef.current = true;
    void postScore(pending).then((r) => {
      if (!r.ok) {
        if (r.code === "NICKNAME_REQUIRED") {
          setSummary((cur) => cur);
          setSubmit({ state: "nickname", error: null });
          setResumeNote(t("resume.nickname"));
        }
        return;
      }
      writePendingRun(null);
      setMe(r.data.standing);
      const today = r.data.standing.today;
      if (today) {
        writeLastRun({ day: pending.day, level: today.level, score: today.score, cleared: today.cleared, recorded: true, rank: today.rank });
        setResumeNote(t(r.data.recorded ? "resume.recorded" : "resume.already", { level: today.level, rank: today.rank }));
      }
      refreshBoard();
    });
  }, [signedIn, refreshBoard, setMe, t]);

  useEffect(() => {
    if (mode !== "game") return;
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    loadScene().then(
      (mod) => {
        if (cancelled) return;
        try {
          sceneRef.current = mod.mountFrikik(host, {
            lang: langRef.current,
            canvasClassName: styles.canvas!,
            handleClassName: styles.handle!,
            goalClassName: styles.goal!,
            trailClassName: styles.trail!,
            goalLabel: goalLabelRef.current,
            onRound: (ri) => setInfo(ri),
            onShot: (_i, result, sum) => {
              setResults((prev) => [...prev, result]);
              setTotal(sum);
            },
            onFinish: (s) => {
              setSummary(s);
              onFinishRef.current(s, dayRef.current ?? turkeyDay(Date.now()));
            },
            onAimStart: () => {},
          });
          setReady(true);
          // Geliştirme: draw call / üçgen sayısı (headless ölçüm)
          if (process.env.NODE_ENV !== "production")
            (
              window as unknown as { __frikikStats?: () => unknown }
            ).__frikikStats = () => sceneRef.current?.stats();
          startGame();
          try {
            if (!localStorage.getItem(TIP_SEEN_KEY)) setTipOpen(true);
          } catch {
            // depolama kapalı: ipucu gösterilmez
          }
        } catch {
          setMode("nowebgl");
        }
      },
      () => setMode("nowebgl"),
    );
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
      setReady(false);
    };
  }, [mode, startGame]);

  const closeTip = () => {
    setTipOpen(false);
    try {
      localStorage.setItem(TIP_SEEN_KEY, "1");
    } catch {
      // depolama kapalı: bu oturumda kapalı kalır
    }
  };

  const share = async () => {
    if (!summary) return;
    const dayKey = day != null ? dayLabel(day) : null;
    const url = `${window.location.origin}${sharePath(summary.level, summary.total, dayKey)}`;
    const text = t("end.shareLevelText", {
      level: summary.level,
      score: summary.total,
    });
    try {
      if (navigator.share) {
        await navigator.share({ title: "Frikik", text, url });
        trackFrikik("frikik_shared", { level: summary.level, method: "share" });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      trackFrikik("frikik_shared", { level: summary.level, method: "clipboard" });
      setShareNote(t("end.copied"));
    } catch {
      // paylaşım iptal edildi / pano yok: sessiz
    }
  };

  const loginFromGame = () => {
    trackFrikik("frikik_login_from_game", { level: summary?.level ?? 0 });
    void signIn("google", { callbackUrl: "/frikik" });
  };

  /** Takma ad: PATCH /api/user/me (kullanıcı adı) → oturumu tazele → bekleyen koşuyu gönder. */
  const saveNickname = async () => {
    const value = nickname.trim();
    if (!value || nickBusy) return;
    setNickBusy(true);
    try {
      const res = await fetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: value }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; username?: string | null; code?: string };
      if (!res.ok) {
        setSubmit({ state: "nickname", error: res.status === 409 ? t("nick.taken") : data.code === "USERNAME_NOT_ALLOWED" ? t("nick.notAllowed") : t("nick.format") });
        return;
      }
      await updateSession({ username: data.username ?? value }).catch(() => {});
      const pending = summary && day != null ? { day: dayLabel(day), seed: summary.seed, simVersion: SIM_VERSION, shots: summary.inputs } : readPendingRun(dayLabel(turkeyDay(Date.now())));
      if (pending) await sendRun(pending, true);
      else setSubmit({ state: "idle" });
    } finally {
      setNickBusy(false);
    }
  };

  const last = results[results.length - 1];
  const showToast = last != null && !summary;
  const wl = windLevel(info.wind);
  const boardStanding = submit.state === "recorded" ? submit.standing : me;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("title")}</h1>
        <p className={styles.sub}>{t("sub")}</p>
        {day != null ? (
          <span className={styles.daily}>
            {t("daily", { date: dayLabel(day) })}
          </span>
        ) : null}
      </div>
      {shared ? (
        <p className={styles.shared}>
          {shared.day
            ? t("sharedLevelDay", { level: shared.level, score: shared.score, date: shared.day })
            : t("sharedLevel", { level: shared.level, score: shared.score })}
        </p>
      ) : null}
      {resumeNote ? (
        <p className={styles.shared} role="status">
          {resumeNote}
        </p>
      ) : null}

      <div
        className={styles.stage}
        role="application"
        aria-label={t("stageLabel")}
      >
        <div ref={hostRef} className={styles.host} />

        {mode === "game" ? (
          <>
            <div className={styles.hud}>
              {
                <div className={styles.levelHud}>
                  <span className={styles.level}>
                    {t("hud.level", { n: info.level })}
                  </span>
                  <span
                    className={styles.hearts}
                    aria-label={t("hud.lives", { n: info.lives, total: LIVES })}
                  >
                    {Array.from({ length: LIVES }, (_, i) => (
                      <span
                        key={i}
                        className={styles.heart}
                        data-lost={i >= info.lives ? "" : undefined}
                      />
                    ))}
                  </span>
                  {wl > 0 ? (
                    <span
                      className={styles.wind}
                      aria-label={t("hud.wind", { n: wl })}
                    >
                      {t("hud.windShort")}{" "}
                      {info.wind > 0 ? "→".repeat(wl) : "←".repeat(wl)}
                    </span>
                  ) : null}
                </div>
              }
              <div className={styles.right}>
                {info.dist > 0 ? (
                  <span className={styles.dist}>
                    {t("hud.dist", { m: Math.round(info.dist) })}
                  </span>
                ) : null}
                <span className={styles.score}>
                  {t("hud.score", { score: total })}
                </span>
              </div>
            </div>
            {!ready ? (
              <div className={styles.center}>{t("loading")}</div>
            ) : null}
            {showToast ? (
              <div
                key={results.length}
                className={styles.toast}
                data-goal={last.kind === "goal" ? "" : undefined}
                role="status"
              >
                {resultLabel(last, t)}
                {last.points > 0
                  ? ` ${t("result.points", { points: last.points })}`
                  : ""}
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "nowebgl" ? (
          <div className={styles.center}>{t("noWebgl")}</div>
        ) : null}

        {mode === "reduced" ? (
          <div className={styles.overlay}>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>{t("reduced.title")}</h2>
              <p className={styles.cardText}>{t("reduced.desc")}</p>
              <button
                type="button"
                className={styles.btn}
                onClick={() => setMode(webglAvailable() ? "game" : "nowebgl")}
              >
                {t("reduced.play")}
              </button>
            </div>
          </div>
        ) : null}

        {tipOpen && !summary ? (
          <div className={styles.overlay}>
            <div
              className={styles.card}
              role="dialog"
              aria-label={t("tip.title")}
            >
              <h2 className={styles.cardTitle}>{t("tip.title")}</h2>
              <ul className={`${styles.shotList} ${styles.tipList}`}>
                <li>{t("tip.l1")}</li>
                <li>{t("tip.l2")}</li>
                <li>{t("tip.l3")}</li>
                <li>{t("tip.l4")}</li>
              </ul>
              <button type="button" className={styles.btn} onClick={closeTip}>
                {t("tip.ok")}
              </button>
            </div>
          </div>
        ) : null}

        {summary ? (
          <div className={styles.overlay}>
            <div
              className={styles.card}
              role="dialog"
              aria-label={t("end.levelTitle")}
            >
              <h2 className={styles.cardTitle}>{t("end.levelTitle")}</h2>
              <p className={styles.cardScore}>
                {t("end.level", { n: summary.level })}
              </p>
              <p className={styles.cardText}>
                {t("end.levelSummary", {
                  cleared: summary.cleared,
                  score: summary.total,
                })}
              </p>

              {submit.state === "sending" ? (
                <p className={styles.note} role="status">
                  {t("submit.sending")}
                </p>
              ) : null}
              {submit.state === "recorded" ? (
                <p className={styles.rankNote} role="status">
                  {submit.standing.today
                    ? submit.first && me?.today == null
                      ? t("submit.recorded", { rank: submit.standing.today.rank })
                      : t("submit.already", { level: submit.standing.today.level, rank: submit.standing.today.rank })
                    : ""}
                </p>
              ) : null}
              {submit.state === "error" ? (
                <p className={styles.note} role="status">
                  {submit.code === "SIM_VERSION" ? t("submit.versionError") : t("submit.error")}
                </p>
              ) : null}
              {submit.state === "login" ? (
                <div className={styles.loginBox}>
                  <p className={styles.cardText}>{t("submit.loginPrompt")}</p>
                  <button type="button" className={styles.btn} onClick={loginFromGame}>
                    {t("submit.loginButton")}
                  </button>
                </div>
              ) : null}
              {submit.state === "nickname" ? (
                <form
                  className={styles.nickForm}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveNickname();
                  }}
                >
                  <label htmlFor="frikik-nick" className={styles.cardText}>
                    {t("nick.prompt")}
                  </label>
                  <input
                    id="frikik-nick"
                    className={styles.nickInput}
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={30}
                    autoComplete="nickname"
                    placeholder={t("nick.placeholder")}
                    aria-invalid={submit.error ? true : undefined}
                  />
                  {submit.error ? (
                    <p className={styles.nickError} role="alert">
                      {submit.error}
                    </p>
                  ) : null}
                  <button type="submit" className={styles.btn} disabled={nickBusy}>
                    {t("nick.save")}
                  </button>
                </form>
              ) : null}

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btn}
                  onClick={startGame}
                >
                  {t("end.again")}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  onClick={() => void share()}
                >
                  {t("end.share")}
                </button>
              </div>
              <p className={styles.note} role="status">
                {shareNote}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {AD_CONTACT ? (
        <p className={styles.adContact}>
          {t("adContact", { email: AD_CONTACT })}
        </p>
      ) : null}

      <Leaderboard board={board} me={boardStanding} loading={board == null && !boardError} error={boardError} />

      <section className={styles.rules}>
        <div>
          <h2>{t("rules.title")}</h2>
          <ol>
            <li>{t("rules.r1")}</li>
            <li>{t("rules.r2")}</li>
            <li>{t("rules.r3")}</li>
            <li>{t("rules.r4")}</li>
          </ol>
        </div>
        <div>
          <h2>{t("rules.scoring")}</h2>
          <ul>
            <li>{t("rules.p1")}</li>
            <li>{t("rules.p2")}</li>
            <li>{t("rules.p3")}</li>
            <li>{t("rules.p4")}</li>
            <li>{t("rules.p5")}</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
