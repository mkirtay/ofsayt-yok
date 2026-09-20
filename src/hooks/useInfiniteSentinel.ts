import { useEffect, useRef } from 'react';

type InfiniteQueryLike = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
};

/**
 * Sonsuz kaydırma gözcüsü: dönen `ref`'i listenin altındaki boş bir elemana verin; görünür olunca (300px önceden)
 * sonraki sayfa çekilir. `itemCount` değişince gözlem yenilenir — yeni sayfa geldikten sonra gözcü hâlâ ekrandaysa
 * bir sonraki sayfa da tetiklenir. IntersectionObserver yoksa hiçbir şey yapmaz ("Daha fazla yükle" düğmesi yedek olur).
 */
export function useInfiniteSentinel({ hasNextPage, isFetchingNextPage, fetchNextPage }: InfiniteQueryLike, itemCount: number) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '300px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, itemCount]);
  return sentinelRef;
}
