import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { GameNav } from '@/components/Game/Info';
import { LeagueView } from '@/components/Game/PrivateLeagues';
import styles from '@/components/Game/game.module.scss';
import '@/lib/i18nNamespaces/game';
import { gamePageGate } from '@/server/game/access';
import { normalizeLeagueCode, privateLeaguesEnabled } from '@/server/game/leagues';
import { prisma } from '@/lib/prisma';

type Props = { code: string; name: string };

/**
 * Özel lig sayfası / davet linki (büyüme raporu 2.2): /tahmin/lig/{kod}. Başlık ve paylaşım önizlemesi için lig adı
 * sunucuda; sıralama ve üyelik istemcide (kişisel). Arama motoruna kapalı.
 */
export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res, params }) => {
  if (!privateLeaguesEnabled()) return { notFound: true };
  const gate = await gamePageGate(req, res);
  if (!gate) return { notFound: true };
  const code = normalizeLeagueCode(params?.code);
  const league = code ? await prisma.gameLeague.findUnique({ where: { code }, select: { name: true } }) : null;
  if (!code || !league) return { notFound: true };
  res.setHeader('Cache-Control', 'private, no-store');
  return { props: { code, name: league.name } };
};

export default function GameLeaguePage({ code, name }: Props) {
  const title = `${name} · Tahmin Ligi özel lig`;
  const desc = `"${name}" özel ligine katıl: haftanın maçlarının skorunu tahmin et, arkadaşlarınla sıralamada yarış. Ücretsiz.`;
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content={desc} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
      </Head>
      <div className={styles.page}>
        <GameNav current="leagues" />
        <LeagueView code={code} />
      </div>
    </>
  );
}
