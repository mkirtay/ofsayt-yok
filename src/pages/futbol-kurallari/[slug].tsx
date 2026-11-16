import type { GetStaticPaths, GetStaticProps } from 'next';
import RulesArticlePage from '@/components/RulesArticle';
import { findRuleArticle, RULE_ARTICLES } from '@/content/futbolKurallari';

/** /futbol-kurallari/{slug} — kural makaleleri (statik). İçerik src/content/futbolKurallari.ts. */
export default function RuleArticleRoute({ slug }: { slug: string }) {
  const article = findRuleArticle(slug);
  return article ? <RulesArticlePage article={article} /> : null;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: RULE_ARTICLES.map((a) => ({ params: { slug: a.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<{ slug: string }> = async ({ params }) => {
  const slug = String(params?.slug ?? '');
  if (!findRuleArticle(slug)) return { notFound: true };
  return { props: { slug } };
};
