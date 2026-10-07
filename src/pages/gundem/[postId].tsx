import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PostDetailPanel from '@/components/PostDetailPanel';
import { prisma } from '@/lib/prisma';
import { useTranslation } from '@/lib/i18n';
import styles from '@/components/GundemHubPage/gundemHubPage.module.scss';
import { siteBaseUrl } from '@/lib/siteUrl';
import { BRAND, brandTitle } from '@/config/brand';

type Props = {
  postId: string;
  /** Paylaşım kartı/SEO için SSR meta (gövde istemcide react-query ile yüklenir). */
  meta: { author: string; body: string };
};

const SITE = siteBaseUrl;

/** Sosyal paylaşım botları JS çalıştırmaz: gönderi metni/yazarı SSR'da `<Head>`'e yazılır. Silinmiş/olmayan post → 404. */
export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const raw = context.params?.postId;
  const postId = Array.isArray(raw) ? raw[0] : raw;
  if (!postId || !/^[a-z0-9]{8,40}$/i.test(postId)) return { notFound: true };

  try {
    const post = await prisma.post.findFirst({
      where: { id: postId, deletedAt: null },
      select: { body: true, author: { select: { name: true, username: true } } },
    });
    if (!post) return { notFound: true };
    return { props: { postId, meta: { author: post.author.name ?? post.author.username ?? BRAND.name, body: post.body } } };
  } catch {
    // DB hatasında sayfayı 500'letmek yerine jenerik meta ile devam (istemci zaten yükler)
    return { props: { postId, meta: { author: BRAND.name, body: '' } } };
  }
};

function snippet(body: string, max: number): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export default function GundemPostPage({ postId, meta }: Props) {
  const router = useRouter();
  const { t } = useTranslation('gundem');
  const title = meta.body ? brandTitle(`${meta.author}: “${snippet(meta.body, 60)}”`) : t('meta.title');
  const description = meta.body ? snippet(meta.body, 160) : t('meta.description');
  const url = `${SITE()}/gundem/${postId}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <link rel="canonical" href={url} />
      </Head>
      <div className={styles.shell}>
        <div className={styles.grid}>
          <Link href="/gundem" className={styles.inlineAction}>
            {t('detail.back')}
          </Link>
          <PostDetailPanel postId={postId} variant="page" onDeleted={() => void router.push('/gundem')} />
        </div>
      </div>
    </>
  );
}
