import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import GundemProfilePage from '@/components/GundemProfilePage';
import { prisma } from '@/lib/prisma';
import { useTranslation } from '@/lib/i18n';

type Props = {
  userId: string;
  /** Paylaşım kartı/SEO için SSR meta (profil gövdesi istemcide react-query ile yüklenir). */
  meta: { name: string; username: string | null };
};

const SITE = () => process.env.AUTH_URL ?? 'https://ofsaytyok.app';

/** `[postId].tsx` kalıbı: botlar JS çalıştırmaz → isim/kullanıcı adı SSR'da `<Head>`'e yazılır. Olmayan kullanıcı → 404. */
export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const raw = context.params?.userId;
  const userId = Array.isArray(raw) ? raw[0] : raw;
  if (!userId || !/^[a-z0-9]{8,40}$/i.test(userId)) return { notFound: true };

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, username: true } });
    if (!user) return { notFound: true };
    return { props: { userId, meta: { name: user.name ?? user.username ?? 'Ofsayt Yok', username: user.username } } };
  } catch {
    // DB hatasında 500 yerine jenerik meta ile devam (istemci zaten yükler)
    return { props: { userId, meta: { name: 'Ofsayt Yok', username: null } } };
  }
};

export default function GundemUserPage({ userId, meta }: Props) {
  const { t } = useTranslation('gundem');
  const title = t('profile.metaTitle', { name: meta.username ? `${meta.name} (@${meta.username})` : meta.name });
  const description = t('profile.metaDescription', { name: meta.name });
  const url = `${SITE()}/gundem/kullanici/${userId}`;

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:type" content="profile" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <link rel="canonical" href={url} />
      </Head>
      <GundemProfilePage userId={userId} />
    </>
  );
}
