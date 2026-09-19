import { useRouter } from 'next/router';
import Container from '@/components/Container';
import TeamDetailView from '@/components/TeamDetailView';

/**
 * /teams/[id] — "Detaylı Görünüm". İçerik `TeamDetailView` ile ana sayfa split-view `TeamDetailPanel`
 * arasında paylaşılır (bu sayfa `variant="page"`).
 */
export default function TeamDetail() {
  const router = useRouter();
  const idParam = router.query.id;
  // Statik prerender/hydration sırasında `asPath` literal "/teams/[id]" olabiliyor → "[id]" takım id'si sanılıp
  // gerçek bir Sportmonks isteği (422) atılıyordu. Yer tutucuyu yok say.
  const rawIdFromPath = router.asPath.match(/^\/teams\/([^/?#]+)/)?.[1] ?? '';
  const idFromPath = /^\[.*\]$/.test(rawIdFromPath) ? '' : rawIdFromPath;
  const teamId =
    typeof idParam === 'string' ? idParam : Array.isArray(idParam) ? (idParam[0] ?? idFromPath) : idFromPath;

  return (
    <Container>
      <TeamDetailView teamId={teamId} variant="page" />
    </Container>
  );
}
