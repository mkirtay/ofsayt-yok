/**
 * Maç paylaşım görselinin adresi: `/api/og/match/{id}?v={sürüm}`. Görselin içeriği HER ZAMAN sunucudaki maç
 * verisinden gelir (adresteki metin kullanılmaz); `v` yalnızca önbellek anahtarıdır — skor / durum / canlı dakika
 * değişince adres de değişir, paylaşım botları ve CDN yeni görseli alır. Sürüm biçimi `[A-Za-z0-9_-]`:
 *
 * - `S`            başlamadı
 * - `L{dk}_{skor}` canlı (ör. `L67_1-0`)
 * - `H_{skor}`     devre arası
 * - `F_{skor}`     bitti
 * - `X{kod}`       özel durum (ertelendi, iptal, yarıda kaldı … — `state_code`)
 */
import type { Match } from '@/models/liveScore';

type OgMatch = Pick<Match, 'id' | 'status' | 'time' | 'scores' | 'score' | 'state_code'>;

function scoreKey(m: OgMatch): string {
  const raw = m.scores?.score || m.score || '';
  const goals = raw.match(/\d+/g);
  return goals && goals.length >= 2 ? `${goals[0]}-${goals[1]}` : '0-0';
}

export function matchOgVersion(m: OgMatch): string {
  if (m.state_code) return `X${m.state_code}`;
  switch (m.status) {
    case 'NOT STARTED':
      return 'S';
    case 'IN PLAY': {
      const minute = (m.time || '').match(/\d+/)?.[0] ?? '0';
      return `L${minute}_${scoreKey(m)}`;
    }
    case 'HALF TIME BREAK':
      return `H_${scoreKey(m)}`;
    case 'FINISHED':
      return `F_${scoreKey(m)}`;
    default:
      return 'X';
  }
}

export function matchOgImagePath(m: OgMatch): string {
  return `/api/og/match/${m.id}?v=${encodeURIComponent(matchOgVersion(m))}`;
}
