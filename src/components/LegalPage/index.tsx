import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import Container from '@/components/Container';
import styles from './legalPage.module.scss';

/** Bölüm tablosu: başlık + satırlar (metin). Kod kaynaklı tablolar (fiyat, veri alıcıları) LegalDocPage'de doldurulur. */
export interface LegalTable {
  caption?: string;
  head: string[];
  rows: string[][];
}

export interface LegalSection {
  heading: string;
  /** Paragraflar boş satırla ("\n\n") ayrılır. */
  body: string;
  /** Hukuki iddia / taahhüt içeren bölüm: avukat onayına kadar "Avukat onayı bekler" rozetiyle işaretlenir. */
  review?: boolean;
  table?: LegalTable;
}

interface LegalPageProps {
  pageTitle: string;
  intro: string;
  sections: LegalSection[];
  draftNotice?: string;
  /** Metnin altında ilgili sayfa bağlantıları (ör. Gizlilik → Hesap silme). */
  related?: { href: string; label: string }[];
  /** "Yürürlük tarihi: 2026-10-16" gibi tek satır (satış belgeleri). */
  effectiveDate?: string;
}

export default function LegalPage({ pageTitle, intro, sections, draftNotice, related, effectiveDate }: LegalPageProps) {
  const { locale } = useI18n();
  const reviewLabel = locale === 'en' ? 'Awaiting lawyer approval' : 'Avukat onayı bekler';

  return (
    <Container>
      <div className={styles.page}>
        <Link href="/" className={styles.backLink}>
          {locale === 'en' ? '← Back to home' : '← Anasayfaya dön'}
        </Link>

        {/* Taslak uyarısı en üstte: yayın öncesi hukuki inceleme bitene kadar okur metnin bağlayıcı olmadığını görür. */}
        {draftNotice ? (
          <p className={styles.draftNotice} role="note">
            {draftNotice}
          </p>
        ) : null}

        <h1 className={styles.title}>{pageTitle}</h1>
        {effectiveDate ? <p className={styles.effectiveDate}>{effectiveDate}</p> : null}
        <p className={styles.intro}>{intro}</p>

        <div className={styles.sections}>
          {sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.sectionHeading}>
                {section.heading}
                {section.review ? <span className={styles.reviewBadge}>{reviewLabel}</span> : null}
              </h2>
              {section.body
                .split('\n\n')
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className={styles.sectionBody}>
                    {para}
                  </p>
                ))}
              {section.table ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    {section.table.caption ? <caption>{section.table.caption}</caption> : null}
                    <thead>
                      <tr>
                        {section.table.head.map((h) => (
                          <th key={h} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, i) => (
                        <tr key={i}>
                          {row.map((cell, j) => (
                            <td key={j}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ))}
        </div>

        {related?.length ? (
          <ul className={styles.related}>
            {related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className={styles.relatedLink}>
                  {r.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Container>
  );
}
