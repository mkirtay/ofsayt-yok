import Link from 'next/link';
import TeamLogo from '@/components/TeamLogo';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/team';
import { formatTransferFee, type TeamTransfer, type TeamTransfers as TeamTransfersData } from '@/services/sportmonks/teamTransfers';
import base from './teamDetailView.module.scss';
import styles from './teamTransfers.module.scss';

type Props = {
  data: TeamTransfersData | null;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

function ddmmyyyy(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

function kindLabelKey(t: TeamTransfer, dir: 'in' | 'out'): string {
  if (t.kind === 'loanReturn') return dir === 'in' ? 'transfers.kind.loanReturnIn' : 'transfers.kind.loanReturnOut';
  return `transfers.kind.${t.kind}`;
}

function Section({ dir, rows }: { dir: 'in' | 'out'; rows: TeamTransfer[] }) {
  const { t } = useTranslation('team');
  const { locale } = useI18n();
  const id = `team-transfers-${dir}`;
  return (
    <section className={base.squadGroup} aria-labelledby={id}>
      <h3 id={id} className={base.squadGroupTitle}>
        {t(dir === 'in' ? 'transfers.incoming' : 'transfers.outgoing')} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className={styles.sectionEmpty}>{t(dir === 'in' ? 'transfers.emptyIn' : 'transfers.emptyOut')}</p>
      ) : (
        <>
          <div className={`${styles.row} ${styles.head}`} aria-hidden="true">
            <span>{t('transfers.player')}</span>
            <span>{t(dir === 'in' ? 'transfers.from' : 'transfers.to')}</span>
            <span className={styles.metaCol}>{t('transfers.type')}</span>
          </div>
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/players/${r.playerId}`} className={`${base.squadPlayer} ${styles.row}`} prefetch={false}>
                  <span className={base.squadNameCol}>
                    {r.playerPhoto ? (
                      <TeamLogo src={r.playerPhoto} alt="" className={base.squadPhoto} width={28} height={28} />
                    ) : (
                      <span className={`${base.squadPhoto} ${base.squadPhotoEmpty}`} aria-hidden="true" />
                    )}
                    <span className={base.squadName}>{r.playerName}</span>
                  </span>
                  <span className={styles.club}>
                    <span className={base.srOnly}>{t(dir === 'in' ? 'transfers.from' : 'transfers.to')}: </span>
                    {r.club ? (
                      <>
                        <TeamLogo src={r.club.logo} alt="" className={styles.clubLogo} width={18} height={18} />
                        <span className={styles.clubName}>{r.club.name}</span>
                      </>
                    ) : (
                      <span className={styles.clubName}>{t('transfers.unknownClub')}</span>
                    )}
                  </span>
                  <span className={styles.metaCol}>
                    <span className={`${styles.kind} ${styles[`kind_${r.kind}`] ?? ''}`.trim()}>{t(kindLabelKey(r, dir))}</span>
                    <span className={styles.sub}>
                      {r.fee ? (
                        <>
                          <span className={base.srOnly}>{t('transfers.fee')}: </span>
                          <span className={styles.fee}>{formatTransferFee(r.fee, locale === 'en' ? 'en' : 'tr')}</span>
                          {' · '}
                        </>
                      ) : null}
                      <span className={base.srOnly}>{t('transfers.date')}: </span>
                      <time dateTime={r.date}>{ddmmyyyy(r.date)}</time>
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/**
 * Takım sayfası "Transferler" sekmesi: Gelenler / Gidenler (son 12 ay, altyapı hareketleri süzülmüş; bkz.
 * services/sportmonks/teamTransfers.ts). Hata "transfer yok" değildir: not + yeniden dene.
 */
export default function TeamTransfers({ data, loading, error, onRetry }: Props) {
  const { t } = useTranslation('team');
  if (error && !data) {
    return (
      <div className={base.squadList}>
        <p className={base.loanError} role="status">
          {t('transfers.error')}{' '}
          <button type="button" className={base.cardHeadBtn} onClick={onRetry}>
            {t('common:retry')}
          </button>
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className={base.squadList}>
        <p className={styles.loading} role="status">
          {loading ? t('transfers.loading') : null}
        </p>
      </div>
    );
  }
  const total = data.incoming.length + data.outgoing.length;
  return (
    <div className={`${base.squadList} ${styles.wrap}`}>
      <p className={styles.scope}>{t('transfers.scope')}</p>
      {total === 0 ? (
        <div className={base.empty}>{t('transfers.empty')}</div>
      ) : (
        <>
          <Section dir="in" rows={data.incoming} />
          <Section dir="out" rows={data.outgoing} />
          <p className={styles.source}>{t('transfers.source')}</p>
        </>
      )}
    </div>
  );
}
