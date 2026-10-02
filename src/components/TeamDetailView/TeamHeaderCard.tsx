import { useState } from 'react';
import Link from 'next/link';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { FormResult, TeamMatch } from '@/services/sportmonks/teamOverview';
import { fullMatchDate, shortMatchDate } from './recentMatchLabels';
import styles from './teamHeaderCard.module.scss';

export type HeaderStanding = { competition: string; competitionLogo?: string; logoBackdrop?: boolean; rank: number; points: number };

export type HeaderNextMatch = {
  href: string;
  opponent: string;
  opponentLogo?: string;
  /** "9 Ekim Cuma" */
  day: string;
  /** "20:00"; saati açıklanmamışsa null */
  time: string | null;
  competition: string;
  competitionLogo?: string;
  logoBackdrop?: boolean;
  /** "7 gün kaldı" / "Bugün 20:00" / "Yarın 20:00" */
  countdown: string;
  isHome: boolean;
};

export type HeaderLiveMatch = {
  href: string;
  minute: string;
  home: { name: string; logo?: string };
  away: { name: string; logo?: string };
  score: string;
};

export type TeamHeaderCardProps = {
  loading: boolean;
  name: string;
  logo?: string;
  standing: HeaderStanding | null;
  standingLoading: boolean;
  next: HeaderNextMatch | null;
  live: HeaderLiveMatch | null;
  form: { result: FormResult; match: TeamMatch }[];
  coach?: string;
  /** Dar kartta (mobil, panel) yalnız ad görünür; şehir `title` ve `aria-label`'da kalır. */
  venue?: { name: string; city?: string };
  compareOpen: boolean;
  onToggleCompare: () => void;
};

const FORM_CLASS: Record<FormResult, string> = { W: styles.win!, D: styles.draw!, L: styles.loss! };

/** Taktik tahtası (teknik direktör) — monokrom, `currentColor`: çerçeve, X, O ve ok. */
function TacticsBoardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="3.5" width="19" height="17" rx="2" />
        <path d="M6 7.5l3 3m0-3l-3 3" />
        <circle cx="16.5" cy="15.5" r="2" />
        <path d="M8 15c1.5 2.5 4 2.8 6 1.4M13.2 8.5c1.8-.3 3.4.4 4.3 2" />
        <path d="M17.6 8.6l-.1 2-1.9-.4" />
      </g>
    </svg>
  );
}

/** Stadyum — monokrom, `currentColor`. */
function StadiumIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="9" rx="9" ry="3.2" />
        <path d="M3 9v6c0 1.8 4 3.2 9 3.2s9-1.4 9-3.2V9" />
        <path d="M7.5 11.6v6.1M16.5 11.6v6.1M12 12.2v6" />
      </g>
    </svg>
  );
}

export default function TeamHeaderCard(props: TeamHeaderCardProps) {
  const { loading, name, logo, standing, standingLoading, next, live, form, coach, venue, compareOpen, onToggleCompare } = props;
  const { t } = useTranslation('team');
  const [focused, setFocused] = useState<number | null>(null);

  const formDetail = (r: FormResult, m: TeamMatch) => {
    const score = m.scores?.score ?? m.scores?.ft_score ?? '';
    return `${t(`form.${r}long`)}: ${m.home?.name ?? ''} ${score} ${m.away?.name ?? ''}, ${fullMatchDate(m)}`;
  };
  const focusedForm = focused != null ? form[focused] : undefined;
  const venueFull = venue ? [venue.name, venue.city].filter(Boolean).join(', ') : '';

  return (
    <div className={styles.card} aria-busy={loading || undefined}>
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.logoWrap}>
            {loading ? (
              <SkeletonBlock className={styles.logo} />
            ) : logo ? (
              <TeamLogo src={logo} alt={name} className={styles.logo} width={72} height={72} />
            ) : (
              <div className={`${styles.logo} ${styles.logoPlaceholder}`}>{name.charAt(0) || '?'}</div>
            )}
          </div>

          <div className={styles.info}>
            {/* Ad + lig rozetleri tek satır kabında: dar kartta iki satıra sarılır, genişte yan yana. Rozetler takım adı
                gelmeden çizilmez (iskelet adının genişliği gerçek addan farklı → rozetler kayardı); kap yüksekliği sabit. */}
            <div className={styles.nameRow}>
              {loading ? (
                <SkeletonBlock width="55%" height={22} />
              ) : (
                <>
                  <h1 className={styles.name}>{name}</h1>
                  <span className={styles.badgeRow}>
                    {standingLoading ? (
                      <SkeletonBlock width={180} height={22} />
                    ) : standing ? (
                      <>
                        <span className={styles.badge}>
                          {standing.competitionLogo ? (
                            <TeamLogo
                              src={standing.competitionLogo}
                              alt=""
                              className={`${styles.badgeLogo} ${standing.logoBackdrop ? styles.logoBackdrop : ''}`.trim()}
                              width={14}
                              height={14}
                            />
                          ) : null}
                          {standing.competition}
                        </span>
                        <span className={`${styles.badge} ${styles.rank}`} title={t('header.rankTitle', { rank: standing.rank })}>
                          {t('header.rankShort', { rank: standing.rank })}
                        </span>
                        <span className={`${styles.badge} ${styles.points}`} title={t('header.pointsTitle', { points: standing.points })}>
                          {t('header.pointsShort', { points: standing.points })}
                        </span>
                      </>
                    ) : null}
                  </span>
                </>
              )}
            </div>

            <div className={styles.formBlock}>
              <div className={styles.formRow}>
                <span className={styles.label}>{t('form.title')}</span>
                {loading ? (
                  <SkeletonBlock width={118} height={20} />
                ) : form.length > 0 ? (
                  <ul className={styles.pills} aria-label={t('form.listAria', { count: form.length })}>
                    {form.map(({ result, match }, i) => (
                      <li key={match.id}>
                        <button
                          type="button"
                          className={`${styles.pill} ${FORM_CLASS[result]} ${i === 0 ? styles.latest : ''}`.trim()}
                          title={formDetail(result, match)}
                          aria-label={`${i === 0 ? `${t('form.latest')}. ` : ''}${formDetail(result, match)}`}
                          aria-pressed={focused === i}
                          onMouseEnter={() => setFocused(i)}
                          onMouseLeave={() => setFocused(null)}
                          onFocus={() => setFocused(i)}
                          onBlur={() => setFocused(null)}
                          onClick={() => setFocused((f) => (f === i ? null : i))}
                        >
                          {t(`form.${result}`)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className={styles.note}>{t('form.empty')}</span>
                )}
              </div>
              {/* Alt not: varsayılan kapsam; rozete gelince / dokununca o maçın özeti (aynı yükseklik). */}
              <div className={styles.note} aria-live="polite">
                {loading
                  ? null
                  : focusedForm
                    ? `${shortMatchDate(focusedForm.match)} · ${focusedForm.match.home?.name ?? ''} ${focusedForm.match.scores?.score ?? ''} ${focusedForm.match.away?.name ?? ''}`
                    : form.length > 0
                      ? t('form.scopeNote', { count: form.length })
                      : null}
              </div>
            </div>

            <div className={styles.facts}>
              <div className={styles.fact}>
                <span className={styles.factIcon}>
                  <TacticsBoardIcon />
                </span>
                <span className={styles.factText}>
                  <span className={styles.label}>{t('header.coachLabel')}</span>
                  {loading ? <SkeletonBlock width={90} height={12} /> : <span className={styles.factValue}>{coach || '—'}</span>}
                </span>
              </div>
              <div
                className={styles.fact}
                role="group"
                aria-label={venueFull ? `${t('header.venueLabel')}: ${venueFull}` : undefined}
              >
                <span className={styles.factIcon}>
                  <StadiumIcon />
                </span>
                <span className={styles.factText} aria-hidden={venueFull ? true : undefined}>
                  <span className={styles.label}>{t('header.venueLabel')}</span>
                  {loading ? (
                    <SkeletonBlock width={110} height={12} />
                  ) : venue ? (
                    <span className={styles.factValue} title={venueFull}>
                      {venue.name}
                      {venue.city ? <span className={styles.venueCity}>, {venue.city}</span> : null}
                    </span>
                  ) : (
                    <span className={styles.factValue}>—</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            className={`${styles.compare} ${compareOpen ? styles.compareOpen : ''}`.trim()}
            onClick={onToggleCompare}
            disabled={loading}
            aria-label={t('compare')}
            aria-expanded={compareOpen}
          >
            <span aria-hidden="true">⇄</span>
            <span className={styles.compareText}>{t('compare')}</span>
          </button>
        </div>

        <NextMatchBox loading={loading} next={next} live={live} />
      </div>
    </div>
  );
}

function NextMatchBox({ loading, next, live }: { loading: boolean; next: HeaderNextMatch | null; live: HeaderLiveMatch | null }) {
  const { t } = useTranslation('team');
  if (loading) {
    return (
      <div className={styles.next} aria-hidden="true">
        <SkeletonBlock width={90} height={10} />
        <SkeletonBlock width="70%" height={16} />
        <SkeletonBlock width="55%" height={12} />
      </div>
    );
  }
  if (live) {
    return (
      <Link href={live.href} className={`${styles.next} ${styles.nextLive}`} aria-label={t('nextBox.liveAria', { home: live.home.name, away: live.away.name, score: live.score, minute: live.minute })}>
        <span className={styles.nextLabel}>
          <span className={styles.liveDot} aria-hidden="true" />
          {t('nextBox.live')} · {live.minute}
        </span>
        <span className={styles.liveScore}>
          <span className={styles.liveTeam}>
            {live.home.logo ? <TeamLogo src={live.home.logo} alt="" className={styles.nextLogo} width={22} height={22} /> : null}
            <span className={styles.liveName}>{live.home.name}</span>
          </span>
          <span className={styles.liveNumbers}>{live.score}</span>
          <span className={`${styles.liveTeam} ${styles.liveTeamAway}`}>
            <span className={styles.liveName}>{live.away.name}</span>
            {live.away.logo ? <TeamLogo src={live.away.logo} alt="" className={styles.nextLogo} width={22} height={22} /> : null}
          </span>
        </span>
        <span className={styles.nextMeta}>{t('nextBox.liveCta')}</span>
      </Link>
    );
  }
  if (!next) {
    return (
      <div className={`${styles.next} ${styles.nextEmpty}`}>
        <span className={styles.nextLabel}>{t('nextBox.label')}</span>
        <span className={styles.nextMeta}>{t('fixtures.empty')}</span>
      </div>
    );
  }
  return (
    <Link href={next.href} className={styles.next} aria-label={t('nextBox.aria', { opponent: next.opponent, day: next.day, time: next.time ?? '', competition: next.competition })}>
      <span className={styles.nextLabel}>{t('nextBox.label')}</span>
      <span className={styles.nextOpponent}>
        {next.opponentLogo ? <TeamLogo src={next.opponentLogo} alt="" className={styles.nextLogo} width={22} height={22} /> : null}
        <span className={styles.nextName}>{next.opponent}</span>
        <span className={styles.nextVenueTag}>{t(next.isHome ? 'nextBox.home' : 'nextBox.away')}</span>
      </span>
      <span className={styles.nextMeta}>
        {next.competitionLogo ? (
          <TeamLogo
            src={next.competitionLogo}
            alt=""
            className={`${styles.badgeLogo} ${next.logoBackdrop ? styles.logoBackdrop : ''}`.trim()}
            width={14}
            height={14}
          />
        ) : null}
        <span className={styles.nextMetaText}>
          {next.day}
          {next.time ? ` · ${next.time}` : ''}
        </span>
      </span>
      <span className={styles.countdown}>{next.countdown}</span>
    </Link>
  );
}
