import { useTranslation } from '@/lib/i18n';
import { BRAND } from '@/config/brand';
import '@/lib/i18nNamespaces/auth';
import { AUTH_SAMPLE } from './sample';
import styles from './authShowcase.module.scss';

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
function AnalysisCard() {
  const { t } = useTranslation('auth');
  return (
    <div className={styles.card}>
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
      <p className={styles.reason}>{t('showcase.reason')}</p>
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

/**
 * Giriş / kayıt sayfasının yan paneli (masaüstünde formun solunda, mobilde altında): kısa bir değer cümlesi, gerçek
 * bitmiş bir maçın AI analiz kartı ve üyelik kazanımları. Başlık yok, etkileşimli öğe yok; saha çizgileri dekor.
 */
export default function AuthShowcase({ className }: { className?: string }) {
  const { t } = useTranslation('auth');
  return (
    <aside className={className ? `${styles.panel} ${className}` : styles.panel} aria-label={BRAND.name}>
      <svg className={styles.pitch} viewBox="0 0 400 260" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
        <rect x="10" y="10" width="380" height="240" rx="6" />
        <line x1="200" y1="10" x2="200" y2="250" />
        <circle cx="200" cy="130" r="38" />
        <rect x="10" y="78" width="54" height="104" />
        <rect x="336" y="78" width="54" height="104" />
      </svg>
      <div className={styles.inner}>
        <p className={styles.lead}>{t('showcase.previewLead')}</p>
        <div className={styles.stack}>
          <AnalysisCard />
          <p className={styles.caption}>{t('showcase.sampleNote')}</p>
        </div>
        <Perks />
      </div>
    </aside>
  );
}
