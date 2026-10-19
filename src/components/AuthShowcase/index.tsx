import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { BRAND } from '@/config/brand';
import '@/lib/i18nNamespaces/auth';
import { AUTH_SAMPLE } from './sample';
import styles from './authShowcase.module.scss';

export type AuthShowcaseVariant = 'preview' | 'moments' | 'proof';

export const AUTH_SHOWCASE_VARIANTS: readonly AuthShowcaseVariant[] = ['preview', 'moments', 'proof'];

/** Deneme aşaması: `?panel=` ile varyant seçilir (geçersiz / yoksa ilk varyant). */
export function showcaseVariant(raw: unknown): AuthShowcaseVariant {
  return AUTH_SHOWCASE_VARIANTS.includes(raw as AuthShowcaseVariant) ? (raw as AuthShowcaseVariant) : 'preview';
}

const S = AUTH_SAMPLE;

function TeamBadge({ team }: { team: { short: string; color: string } }) {
  return (
    <span className={styles.badge} style={{ background: team.color }} aria-hidden="true">
      {team.short}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** Üç parçalı olasılık çubuğu (ev / beraberlik / deplasman). */
function ProbBar() {
  const { t } = useTranslation('auth');
  const p = S.prediction;
  return (
    <div className={styles.prob}>
      <div className={styles.probBar} aria-hidden="true">
        <span className={styles.probHome} style={{ flexGrow: p.home }} />
        <span className={styles.probDraw} style={{ flexGrow: p.draw }} />
        <span className={styles.probAway} style={{ flexGrow: p.away }} />
      </div>
      <div className={styles.probLegend}>
        <span>
          {S.home.name} <b>%{p.home}</b>
        </span>
        <span>
          {t('showcase.draw')} <b>%{p.draw}</b>
        </span>
        <span>
          {S.away.name} <b>%{p.away}</b>
        </span>
      </div>
    </div>
  );
}

/** Gerçek, bitmiş maçın AI analiz kartı (küçük önizleme). */
function AnalysisCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation('auth');
  return (
    <div className={compact ? `${styles.card} ${styles.cardCompact}` : styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.aiTag}>{t('showcase.aiTag')}</span>
        <span className={styles.meta}>
          {S.competition} · {t('showcase.finished')}
        </span>
      </div>
      <div className={styles.scoreRow}>
        <span className={styles.team}>
          <TeamBadge team={S.home} />
          {S.home.name}
        </span>
        <span className={styles.score}>
          {S.score.home}–{S.score.away}
        </span>
        <span className={`${styles.team} ${styles.teamAway}`}>
          {S.away.name}
          <TeamBadge team={S.away} />
        </span>
      </div>
      <ProbBar />
      <div className={styles.hitRow}>
        <span>
          {t('showcase.mostLikely')} <b className={styles.mono}>{S.prediction.mostLikely}</b>
        </span>
        {S.scoreHit && (
          <span className={styles.hit}>
            <CheckIcon />
            {t('showcase.hit')}
          </span>
        )}
      </div>
      {!compact && <p className={styles.reason}>{t('showcase.reason')}</p>}
    </div>
  );
}

function Perks() {
  const { t } = useTranslation('auth');
  return (
    <ul className={styles.perks}>
      {(['perkCredits', 'perkWeekly', 'perkPublic'] as const).map((k) => (
        <li key={k}>
          <CheckIcon />
          {t(`showcase.${k}`)}
        </li>
      ))}
    </ul>
  );
}

/* ── A: ürün önizlemesi ───────────────────────────────────────────────────── */
function PreviewPanel() {
  const { t } = useTranslation('auth');
  return (
    <>
      <p className={styles.lead}>{t('showcase.previewLead')}</p>
      <div className={styles.stack}>
        <AnalysisCard />
        <p className={styles.caption}>{t('showcase.sampleNote')}</p>
      </div>
      <Perks />
    </>
  );
}

/* ── B: dönen "an" kartları ─────────────────────────────────────────────── */
const MOMENTS = ['live', 'ai', 'feed'] as const;
const ROTATE_MS = 5000;

function LiveCard() {
  const { t } = useTranslation('auth');
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={`${styles.aiTag} ${styles.liveTag}`}>
          <span className={styles.liveDot} aria-hidden="true" />
          {t('showcase.live')}
        </span>
        <span className={styles.meta}>{S.competition}</span>
      </div>
      <div className={styles.scoreRow}>
        <span className={styles.team}>
          <TeamBadge team={S.home} />
          {S.home.name}
        </span>
        <span className={styles.score}>
          {S.score.home}–{S.score.away}
          <small className={styles.minute}>78&apos;</small>
        </span>
        <span className={`${styles.team} ${styles.teamAway}`}>
          {S.away.name}
          <TeamBadge team={S.away} />
        </span>
      </div>
      <div className={styles.favRow}>
        <span className={styles.star} aria-hidden="true">★</span>
        {t('showcase.favRow')}
      </div>
    </div>
  );
}

function FeedCard() {
  const { t } = useTranslation('auth');
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.aiTag}>{t('showcase.feedTag')}</span>
        <span className={styles.bell} aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0" />
          </svg>
          <span className={styles.bellDot} />
        </span>
      </div>
      <div className={styles.post}>
        <span className={styles.avatar} aria-hidden="true">T</span>
        <div>
          <p className={styles.postUser}>{t('showcase.feedUser')}</p>
          <p className={styles.postText}>{t('showcase.feedText')}</p>
          <p className={styles.postMeta}>
            <span>♥ 24</span>
            <span>{t('showcase.feedReplies', { count: 7 })}</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function MomentsPanel() {
  const { t } = useTranslation('auth');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % MOMENTS.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused]);

  return (
    <div
      className={styles.momentsWrap}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p className={styles.lead}>{t('showcase.momentsLead')}</p>
      <div className={styles.momentStack}>
        {MOMENTS.map((m, i) => (
          <div key={m} className={i === index ? `${styles.moment} ${styles.momentOn}` : styles.moment} aria-hidden={i !== index}>
            {m === 'live' ? <LiveCard /> : m === 'ai' ? <AnalysisCard compact /> : <FeedCard />}
            <p className={styles.momentCaption}>{t(`showcase.moment_${m}`)}</p>
          </div>
        ))}
      </div>
      <div className={styles.dots}>
        {MOMENTS.map((m, i) => (
          <button
            key={m}
            type="button"
            className={i === index ? `${styles.dot} ${styles.dotOn}` : styles.dot}
            aria-label={t(`showcase.momentLabel_${m}`)}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
      <p className={styles.caption}>{t('showcase.illustrationNote')}</p>
    </div>
  );
}

/* ── C: sade marka + sosyal kanıt (AI isabet oranı) ─────────────────────── */
type Stats = { totalEvaluated: number; result1x2HitRate: number };
/** Az örnekle yüzde yanıltıcı: altında oran gösterilmez, örnek maç kalır. */
const MIN_EVALUATED = 30;

function ProofPanel() {
  const { t } = useTranslation('auth');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai-stats')
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then((d) => {
        if (!cancelled && d && d.totalEvaluated >= MIN_EVALUATED) setStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <p className={`${styles.lead} ${styles.leadBig}`}>{t('showcase.proofLead')}</p>
      <div className={styles.proofStat}>
        {stats ? (
          <>
            <span className={styles.bigNum}>%{Math.round(stats.result1x2HitRate)}</span>
            <span className={styles.bigLabel}>{t('showcase.proofRate', { count: stats.totalEvaluated })}</span>
          </>
        ) : (
          <>
            <span className={styles.bigNum}>
              {S.prediction.mostLikely}
              <span className={styles.bigCheck}>
                <CheckIcon />
              </span>
            </span>
            <span className={styles.bigLabel}>{t('showcase.proofSample')}</span>
          </>
        )}
      </div>
      <Perks />
    </>
  );
}

/**
 * Giriş / kayıt sayfasının yan paneli (masaüstünde formun solunda, mobilde altında). Etkileşimli öğe yalnız
 * "moments" varyantının nokta düğmeleri; panelde başlık yok, kısa bir değer cümlesi + ürünün kendisi.
 */
export default function AuthShowcase({ variant, className }: { variant: AuthShowcaseVariant; className?: string }) {
  return (
    <aside className={[styles.panel, variant === 'moments' ? styles.momentsVariant : styles[variant], className].filter(Boolean).join(' ')} aria-label={BRAND.name}>
      <svg className={styles.pitch} viewBox="0 0 400 260" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <rect x="10" y="10" width="380" height="240" rx="6" />
        <line x1="200" y1="10" x2="200" y2="250" />
        <circle cx="200" cy="130" r="38" />
        <rect x="10" y="78" width="54" height="104" />
        <rect x="336" y="78" width="54" height="104" />
      </svg>
      <div className={styles.inner}>
        {variant === 'preview' && <PreviewPanel />}
        {variant === 'moments' && <MomentsPanel />}
        {variant === 'proof' && <ProofPanel />}
      </div>
    </aside>
  );
}
