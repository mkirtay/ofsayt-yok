import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import PostDetailPanel from '@/components/PostDetailPanel';
import { prisma } from '@/lib/prisma';
import { useTranslation } from '@/lib/i18n';
import styles from '@/components/GundemHubPage/gundemHubPage.module.scss';

type Props = {
  postId: string;
  /** Paylaşım kartı/SEO için SSR meta (gövde istemcide react-query ile yüklenir). */
  meta: { author: string; body: string };
};

const SITE = () => process.env.AUTH_URL ?? 'https://ofsaytyok.app';

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
    return { props: { postId, meta: { author: post.author.name ?? post.author.username ?? 'Ofsayt Yok', body: post.body } } };
  } catch {
    // DB hatasında sayfayı 500'letmek yerine jenerik meta ile devam (istemci zaten yükler)
    return { props: { postId, meta: { author: 'Ofsayt Yok', body: '' } } };
  }
};

function snippet(body: string, max: number): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export default function GundemPostPage({ postId, meta }: Props) {
  const router = useRouter();
  const { t } = useTranslation('gundem');
  const title = meta.body ? `${meta.author}: “${snippet(meta.body, 60)}” | Ofsayt Yok` : t('meta.title');
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
