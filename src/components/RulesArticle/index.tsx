import Head from 'next/head';
import Link from 'next/link';
import type { ReactNode } from 'react';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import { BRAND, brandTitle } from '@/config/brand';
import {
  parseInline,
  plainRuleText,
  RULE_ARTICLES,
  RULES_HUB,
  RULES_HUB_PATH,
  ruleArticlePath,
  type RuleArticle,
  type RuleBlock,
} from '@/content/futbolKurallari';
import { siteBaseUrl } from '@/lib/siteUrl';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import OffsideDiagram from './OffsideDiagram';
import styles from './rulesArticle.module.scss';

export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((p, i) =>
        p.kind === 'bold' ? (
          <strong key={i}>{p.text}</strong>
        ) : p.kind === 'link' ? (
          <Link key={i} href={p.href}>
            {p.text}
          </Link>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: RuleBlock }) {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <Inline text={block.text} />
        </p>
      );
    case 'ul':
    case 'ol': {
      const Tag = block.type;
      return (
        <Tag>
          {block.items.map((it) => (
            <li key={it}>
              <Inline text={it} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'table':
      return (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        <Inline text={c} />
                      </th>
                    ) : (
                      <td key={i}>
                        <Inline text={c} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'offsideDiagram':
      return <OffsideDiagram />;
  }
}

/** Article + FAQPage + BreadcrumbList şemaları (SEO/GEO planı). */
export function ruleArticleSchemas(a: RuleArticle): Record<string, unknown>[] {
  const base = siteBaseUrl();
  const url = `${base}${ruleArticlePath(a)}`;
  const org = { '@type': 'Organization', name: BRAND.name, url: `${base}/` };
  const crumbs = a.slug
    ? breadcrumbJsonLd([
        { name: 'Futbol Kuralları', url: `${base}${RULES_HUB_PATH}` },
        { name: a.heading, url },
      ])
    : breadcrumbJsonLd([{ name: 'Futbol Kuralları', url }]);
  const out: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: a.heading,
      description: a.description,
      url,
      mainEntityOfPage: url,
      inLanguage: 'tr-TR',
      datePublished: a.publishedIso,
      dateModified: a.updatedIso,
      author: org,
      publisher: org,
    },
    crumbs,
  ];
  if (a.faq.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: a.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: plainRuleText(f.a) } })),
    });
  }
  return out;
}

/** Futbol kuralları makale / hub sayfası. `aside` hub'da makale listesi için. */
export default function RulesArticlePage({ article, aside }: { article: RuleArticle; aside?: ReactNode }) {
  const url = `${siteBaseUrl()}${ruleArticlePath(article)}`;
  const title = brandTitle(article.title);
  const related = [RULES_HUB, ...RULE_ARTICLES].filter((a) => a.slug !== article.slug);
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={article.description} key="description" />
        <link rel="canonical" href={url} key="canonical" />
        <meta property="og:type" content="article" key="og:type" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={article.description} key="og:description" />
        <meta property="og:url" content={url} key="og:url" />
        <meta property="article:modified_time" content={article.updatedIso} key="article:modified_time" />
      </Head>
      {ruleArticleSchemas(article).map((s, i) => (
        <JsonLd key={i} schema={s} />
      ))}
      <Container>
        <article className={styles.page}>
          <nav className={styles.crumbs} aria-label="Sayfa yolu">
            <Link href="/">{BRAND.name}</Link>
            <span aria-hidden="true">›</span>
            {article.slug ? <Link href={RULES_HUB_PATH}>Futbol Kuralları</Link> : <span aria-current="page">Futbol Kuralları</span>}
          </nav>
          <span className={styles.badge}>{article.badge}</span>
          <h1 className={styles.title}>{article.heading}</h1>
          <p className={styles.meta}>
            Son güncelleme: <time dateTime={article.updatedIso}>{article.updated}</time> · {BRAND.name} editör ekibi · Kaynak: IFAB Oyun
            Kuralları 2026/27
          </p>
          <p className={styles.lead}>
            <Inline text={article.lead} />
          </p>

          {aside}

          {article.sections.map((s) => (
            <section key={s.id} id={s.id} className={styles.section}>
              <h2>{s.heading}</h2>
              {s.blocks.map((b, i) => (
                <Block key={i} block={b} />
              ))}
            </section>
          ))}

          {article.faq.length ? (
            <section id="sss" className={`${styles.section} ${styles.faq}`}>
              <h2>Sık sorulan sorular</h2>
              {article.faq.map((f) => (
                <div key={f.q} className={styles.faqItem}>
                  <h3>{f.q}</h3>
                  <p>
                    <Inline text={f.a} />
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          <section className={`${styles.section} ${styles.related}`} aria-labelledby="ilgili">
            <h2 id="ilgili">Diğer kural rehberleri</h2>
            <ul className={styles.cards}>
              {related.map((a) => (
                <li key={a.slug || 'hub'}>
                  <Link href={ruleArticlePath(a)} className={styles.card}>
                    <span className={styles.cardBadge}>{a.badge}</span>
                    <strong>{a.heading}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <p className={styles.sources}>
            Kaynak: IFAB Oyun Kuralları (theifab.com) ve TFF duyuruları. Kurallar her yıl 1 Temmuz&apos;da güncellenir; bu sayfa her yaz
            yeniden gözden geçirilir.
          </p>
        </article>
      </Container>
    </>
  );
}
