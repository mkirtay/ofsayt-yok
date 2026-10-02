import type { ReactNode } from 'react';
import { SkeletonBlock } from '@/components/Skeleton';
import TeamLogo from '@/components/TeamLogo';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import type { FormResult, TeamMatch } from '@/services/sportmonks/teamOverview';
import { shortMatchDate } from './recentMatchLabels';
import styles from './teamDetailView.module.scss';

export type TeamHeaderProps = {
  /** Takım isteği gelene kadar: aynı satırlar, aynı yükseklik, içerik yerine iskelet. */
  loading: boolean;
  name: string;
  logo?: string;
  /** "Süper Lig · 1. sıra · 13 puan"; `null` → satır boş kalır (yüksekliği korunur). */
  standingText: string | null;
  standingLoading: boolean;
  nextMatch: { opponent: string; when: string } | null;
  form: { result: FormResult; match: TeamMatch }[];
  compareOpen: boolean;
  onToggleCompare: () => void;
  /** Faz 2: teknik direktör / stadyum satırı. */
  extraLine?: ReactNode;
};

const FORM_CLASS: Record<FormResult, string> = {
  W: styles.formWin!,
  D: styles.formDraw!,
  L: styles.formLoss!,
};

/**
 * Takım başlığı. Her satırın yüksekliği CSS'te sabit (`.headerLine*`) ve iskelet aynı satırları kullanır → veri
 * hangi sırayla gelirse gelsin başlık yüksekliği değişmez (CLS 0).
 */
export default function TeamHeader({
  loading,
  name,
  logo,
  standingText,
  standingLoading,
  nextMatch,
  form,
  compareOpen,
  onToggleCompare,
  extraLine,
}: TeamHeaderProps) {
  const { t } = useTranslation('team');
  const resultsText = form.map((f) => t(`form.${f.result}long`)).join(', ');

  return (
    <div className={styles.teamHeader} aria-busy={loading || undefined}>
      {loading ? (
        // Boyut CSS'ten (.teamLogo: 56 px, dar ekranda 44 px) — satır içi genişlik verilirse logo gelince kayar.
        <SkeletonBlock className={styles.teamLogo} />
      ) : logo ? (
        <TeamLogo src={logo} alt={name} className={styles.teamLogo} width={56} height={56} />
      ) : (
        <div className={styles.logoPlaceholder}>{name.charAt(0) || '?'}</div>
      )}

      <div className={styles.teamHeaderInfo}>
        <div className={styles.headerLineName}>
          {loading ? <SkeletonBlock width="55%" height={20} /> : <h1 className={styles.teamName}>{name}</h1>}
        </div>

        <div className={styles.headerLineMeta}>
          {loading || standingLoading ? (
            <SkeletonBlock width="70%" height={12} />
          ) : standingText ? (
            <span className={styles.teamMeta}>{standingText}</span>
          ) : null}
        </div>

        <div className={styles.headerLineNext}>
          {loading ? (
            <SkeletonBlock width="80%" height={11} />
          ) : nextMatch ? (
            <span className={styles.teamNextMatch}>
              <span className={styles.teamNextLabel}>{t('nextMatchLabel')}</span>
              <span className={styles.teamNextOpponent}>{nextMatch.opponent}</span>
              <span className={styles.teamNextWhen}>· {nextMatch.when}</span>
            </span>
          ) : null}
        </div>

        <div className={styles.headerLineForm}>
          {loading ? (
            <SkeletonBlock width={142} height={20} />
          ) : form.length > 0 ? (
            <>
              <span className={styles.headerFormRow} role="img" aria-label={t('form.aria', { count: form.length, results: resultsText })}>
                {form.map(({ result, match }) => {
                  const score = match.scores?.score ?? match.scores?.ft_score ?? '';
                  return (
                    <span
                      key={match.id}
                      className={`${styles.formPill} ${FORM_CLASS[result]}`}
                      title={`${shortMatchDate(match)} · ${match.home?.name ?? ''} ${score} ${match.away?.name ?? ''}`.trim()}
                    >
                      {t(`form.${result}`)}
                    </span>
                  );
                })}
              </span>
              <span className={styles.headerFormScope}>{t('form.scope')}</span>
            </>
          ) : (
            <span className={styles.headerFormScope}>{t('form.empty')}</span>
          )}
        </div>

        {extraLine !== undefined ? <div className={styles.headerLineExtra}>{extraLine}</div> : null}
      </div>

      <button
        type="button"
        className={`${styles.compareToggleBtn} ${compareOpen ? styles.compareToggleBtnOpen : ''}`}
        onClick={onToggleCompare}
        disabled={loading}
        aria-label={t('compare')}
        aria-expanded={compareOpen}
      >
        <span aria-hidden="true">⇄</span>
        <span className={styles.compareToggleText}>{t('compare')}</span>
      </button>
    </div>
  );
}
