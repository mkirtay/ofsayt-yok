import Head from 'next/head';
import type { ReactNode } from 'react';
import Container from '@/components/Container';
import JsonLd from '@/components/JsonLd';
import { siteBaseUrl } from '@/lib/siteUrl';
import { breadcrumbJsonLd } from '@/utils/breadcrumbJsonLd';
import styles from './infoPage.module.scss';

export const infoStyles = styles;

/** Kurumsal bilgi sayfası kabuğu (Hakkımızda, Yöntem): başlık, açıklama, canonical, Breadcrumb + sayfa türü şeması. */
export default function InfoPage({
  path,
  title,
  heading,
  description,
  lead,
  schemaType,
  updated,
  children,
}: {
  path: string;
  title: string;
  heading: string;
  description: string;
  lead: ReactNode;
  schemaType: 'AboutPage' | 'WebPage';
  updated: string;
  children: ReactNode;
}) {
  const url = `${siteBaseUrl()}${path}`;
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} key="description" />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:url" content={url} key="og:url" />
      </Head>
      <JsonLd
        schema={{ '@context': 'https://schema.org', '@type': schemaType, name: heading, url, description, inLanguage: 'tr-TR', dateModified: updated }}
      />
      <JsonLd schema={breadcrumbJsonLd([{ name: heading, url }])} />
      <Container>
        <article className={styles.page}>
          <h1 className={styles.title}>{heading}</h1>
          <p className={styles.lead}>{lead}</p>
          {children}
          <p className={styles.updated}>Son güncelleme: {updated}</p>
        </article>
      </Container>
    </>
  );
}
