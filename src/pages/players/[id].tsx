import Head from 'next/head';
import { useRouter } from 'next/router';
import Container from '@/components/Container';
import PlayerProfile from '@/components/PlayerProfile';
import { usePlayerProfile } from '@/hooks/usePlayerProfile';

/** /players/[id] — bağımsız oyuncu detay sayfası (panel DEĞİL). Kadro / İlk 11 / Gol Krallığı bağlantılarının hedefi. */
export default function PlayerPage() {
  const router = useRouter();
  const raw = router.query.id;
  const rawFromPath = router.asPath.match(/^\/players\/([^/?#]+)/)?.[1] ?? '';
  // Statik prerender sırasında `[id]` yer tutucusu gerçek id sanılmasın (takım sayfasındaki 422 bug'ının aynısı).
  const fromPath = /^\[.*\]$/.test(rawFromPath) ? '' : rawFromPath;
  const playerId = typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? fromPath) : fromPath;
  const { data } = usePlayerProfile(playerId, Boolean(playerId));
  const title = `${data?.name ?? 'Oyuncu'} — Oyuncu Detayı | Ofsayt Yok`;

  return (
    <Container>
      <Head>
        <title>{title}</title>
        <meta name="description" content={`${data?.name ?? 'Oyuncu'} profili, sezon istatistikleri, transfer geçmişi ve son maçları.`} />
        {data?.photo ? <meta property="og:image" content={data.photo} key="og:image" /> : null}
      </Head>
      {playerId ? <PlayerProfile playerId={playerId} /> : null}
    </Container>
  );
}
