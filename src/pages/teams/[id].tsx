import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import TeamDetailView from '@/components/TeamDetailView';
import { teamOgImagePath } from '@/utils/teamOgImage';

type TeamPageProps = {
  /** Paylaşım etiketleri için (sunucuda, ISR); geçici hatada null — sayfa yine istemcide yüklenir. */
  teamName: string | null;
  ogImagePath: string;
};

const SITE_URL = process.env.AUTH_URL ?? 'https://ofsaytyok.app';
const DAY_SECONDS = 86_400;

/**
 * ISR kabuğu: yalnız paylaşım etiketleri (og / twitter) için takım adı sunucuda; sayfanın tüm verisi eskisi gibi
 * istemcide (TeamDetailView). Önceden sayfa üretilmez (`paths: []`), ilk ziyarette üretilip 1 gün önbellekte kalır.
 */
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<TeamPageProps> = async ({ params }) => {
  const id = String(params?.id ?? '');
  const { loadTeamPageShell } = await import('@/server/teamPageShell');
  const shell = await loadTeamPageShell(id);
  if (shell.kind === 'missing') return { notFound: true, revalidate: DAY_SECONDS };
  return {
    props: { teamName: shell.kind === 'found' ? shell.name : null, ogImagePath: teamOgImagePath(id) },
    // Geçici hata: etiketsiz kabuk kısa süre kalsın.
    revalidate: shell.kind === 'found' ? DAY_SECONDS : 60,
  };
};

/**
 * /teams/[id] — "Detaylı Görünüm". İçerik `TeamDetailView` ile ana sayfa split-view `TeamDetailPanel`
 * arasında paylaşılır (bu sayfa `variant="page"`).
 */
export default function TeamDetail({ teamName, ogImagePath }: TeamPageProps) {
  const router = useRouter();
  const idParam = router.query.id;
  // Statik prerender/hydration sırasında `asPath` literal "/teams/[id]" olabiliyor → "[id]" takım id'si sanılıp
  // gerçek bir Sportmonks isteği (422) atılıyordu. Yer tutucuyu yok say.
  const rawIdFromPath = router.asPath.match(/^\/teams\/([^/?#]+)/)?.[1] ?? '';
  const idFromPath = /^\[.*\]$/.test(rawIdFromPath) ? '' : rawIdFromPath;
  const teamId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? (idParam[0] ?? idFromPath) : idFromPath;

  const title = teamName ? `${teamName} — Takım Detayı | Ofsayt Yok` : 'Takım Detayı | Ofsayt Yok';
  const description = teamName
    ? `${teamName} takımının son maçları, kadro bilgileri ve lig istatistikleri.`
    : 'Takımın son maçları, kadro bilgileri ve lig istatistikleri.';
  const ogImage = `${SITE_URL}${ogImagePath}`;
  const imageAlt = teamName ? `${teamName} — lig sırası ve son maçlar` : 'Ofsayt Yok takım sayfası';

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} key="description" />
        <meta property="og:title" content={title} key="og:title" />
        <meta property="og:description" content={description} key="og:description" />
        <meta property="og:type" content="website" key="og:type" />
        {teamId ? <meta property="og:url" content={`${SITE_URL}/teams/${teamId}`} key="og:url" /> : null}
        <meta property="og:image" content={ogImage} key="og:image" />
        <meta property="og:image:width" content="1200" key="og:image:width" />
        <meta property="og:image:height" content="630" key="og:image:height" />
        <meta property="og:image:alt" content={imageAlt} key="og:image:alt" />
        <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
        <meta name="twitter:title" content={title} key="twitter:title" />
        <meta name="twitter:description" content={description} key="twitter:description" />
        <meta name="twitter:image" content={ogImage} key="twitter:image" />
        <meta name="twitter:image:alt" content={imageAlt} key="twitter:image:alt" />
      </Head>
      <TeamDetailView key={teamId} teamId={teamId} variant="page" />
    </Container>
  );
}
