import Link from 'next/link';
import { useI18n } from '@/lib/i18n';
import Container from '@/components/Container';
import styles from './legalPage.module.scss';

interface LegalSection {
  heading: string;
  body: string;
}

interface LegalPageProps {
  pageTitle: string;
  intro: string;
  sections: LegalSection[];
  draftNotice?: string;
}

export default function LegalPage({ pageTitle, intro, sections, draftNotice }: LegalPageProps) {
  const { locale } = useI18n();

  return (
    <Container>
      <div className={styles.page}>
        <Link href="/" className={styles.backLink}>
          {locale === 'en' ? '← Back to home' : '← Anasayfaya dön'}
        </Link>

        <h1 className={styles.title}>{pageTitle}</h1>
        <p className={styles.intro}>{intro}</p>

        <div className={styles.sections}>
          {sections.map((section) => (
            <section key={section.heading} className={styles.section}>
              <h2 className={styles.sectionHeading}>{section.heading}</h2>
              <p className={styles.sectionBody}>{section.body}</p>
            </section>
          ))}
        </div>

        {draftNotice ? <p className={styles.draftNotice}>{draftNotice}</p> : null}
      </div>
    </Container>
  );
}
