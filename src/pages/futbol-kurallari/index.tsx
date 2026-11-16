import RulesArticlePage from '@/components/RulesArticle';
import RulesExplorer from '@/components/RulesArticle/RulesExplorer';
import { RULES_HUB } from '@/content/futbolKurallari';

/** /futbol-kurallari — 17 kural: solda başlıklar, sağda animasyon + kısa açıklama. İçerik src/content/futbolKurallari.ts. */
export default function RulesHubPage() {
  return <RulesArticlePage article={RULES_HUB} aside={<RulesExplorer />} wide />;
}

export async function getStaticProps() {
  return { props: {} };
}
