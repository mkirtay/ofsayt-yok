import { useState } from 'react';
import { useSession } from 'next-auth/react';
import GundemPanel from '@/components/GundemPanel';
import GundemScopeTabs from '@/components/GundemScopeTabs';
import type { GundemScope } from '@/types/gundem';

/**
 * Ana sayfa yan paneli: kompakt akış sekmeleri (Tümü | Takip | Resmi | Maçlar) + satır içi composer'lı akış.
 * Sekme seçimi URL'e yazılmaz (ana sayfanın query'si maç/takım seçimine ait); panel yeniden mount olunca "Tümü"ne döner.
 */
export default function HomeGundemPanel({
  onOpenPost,
  staleTime,
}: {
  onOpenPost: (postId: string) => void;
  /** Akış sorgusunun `staleTime`'ı (ms); GundemPanel'e aynen geçer. */
  staleTime?: number;
}) {
  const { status } = useSession();
  const unauthenticated = status === 'unauthenticated';
  const [requested, setScope] = useState<GundemScope>('all');
  const scope: GundemScope = requested === 'following' && unauthenticated ? 'all' : requested;
  return (
    <>
      <GundemScopeTabs value={scope} onChange={setScope} hideFollowing={unauthenticated} compact />
      <GundemPanel scope={scope} composer="post-inline" staleTime={staleTime} onOpenPost={onOpenPost} />
    </>
  );
}
