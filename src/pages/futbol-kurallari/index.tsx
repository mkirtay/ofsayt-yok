import Link from 'next/link';
import RulesArticlePage from '@/components/RulesArticle';
import styles from '@/components/RulesArticle/rulesArticle.module.scss';
import { RULES_HUB } from '@/content/futbolKurallari';

/** /futbol-kurallari — 17 kuralın özeti (hub). Statik; içerik src/content/futbolKurallari.ts. */
export default function RulesHubPage() {
  return (
    <RulesArticlePage
      article={RULES_HUB}
      aside={
        <nav className={styles.ruleIndex} aria-labelledby="kural-dizini">
          <h2 id="kural-dizini">17 kural</h2>
          <ol>
            {RULES_HUB.sections.map((s) => (
              <li key={s.id}>
                <Link href={`#${s.id}`}>{s.heading.replace(/^Kural \d+ – /, '')}</Link>
              </li>
            ))}
          </ol>
        </nav>
      }
    />
  );
}

export async function getStaticProps() {
  return { props: {} };
}
