/* eslint-disable @next/next/no-img-element -- şeffaf WebP portreler zaten boyutlandırılmış (public/mini-saha); next/image optimizasyonu gerekmez */
import { useEffect, useRef, useState } from 'react';
import { CHARACTERS, portraitSrc, type CharId } from '@/lib/miniSaha/characters';
import { drawCharacter, type TokenImages } from './render';

/** Kodla çizilen karakter simgesi (yukarı bakar) — portre yüklenemezse yedek. */
export function Avatar({ id, size }: { id: CharId; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    // setTransform'un öteleme değerleri cihaz pikseli: merkez = size/2 × dpr
    g.setTransform(dpr, 0, 0, dpr, (size / 2) * dpr, (size / 2) * dpr);
    g.rotate(-Math.PI / 2);
    drawCharacter(g, CHARACTERS[id], 0, size * 0.36);
  }, [id, size]);
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size }} aria-hidden />;
}

/**
 * Karakter portresi (`lg` seçim ekranı, `face` maç içi panel / gol bildirimi). Görsel yoksa ya da yüklenemezse
 * kodla çizilen simge gösterilir; oyun bundan etkilenmez.
 */
export function Portrait({ id, size, variant, className }: { id: CharId; size: number; variant: 'lg' | 'face'; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <Avatar id={id} size={size} />;
  return (
    <img
      src={portraitSrc(id, variant)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      decoding="async"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** Maç içinde kullanılan küçük portreleri ve saha jetonlarını önceden indirir (maç sırasında ağ beklemesi olmasın). */
export function preloadFaces(ids: readonly CharId[]): void {
  if (typeof window === 'undefined') return;
  for (const id of ids) {
    for (const v of ['face', 'token'] as const) {
      const img = new Image();
      img.decoding = 'async';
      img.src = portraitSrc(id, v);
    }
  }
}

/**
 * Saha jetonlarını yükler ve çözer; hazır olanlar `into`'ya eklenir (oyun döngüsü yalnız hazır görseli çizer, yoksa
 * kodla çizilen simgeye düşer). Dönüş: iptal (sahne kapanınca).
 */
export function loadTokens(ids: readonly CharId[], into: TokenImages): () => void {
  let alive = true;
  for (const id of ids) {
    const img = new Image();
    img.src = portraitSrc(id, 'token');
    img.decode().then(
      () => { if (alive) into[id] = img; },
      () => { /* yoksa yedek çizim */ },
    );
  }
  return () => { alive = false; };
}
