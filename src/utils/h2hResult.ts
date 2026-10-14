/**
 * Karşılaşma geçmişi satırında kazanan taraf: skordan; berabere biten ve penaltıya giden maçta penaltı skorundan.
 * Skor okunamıyorsa (oynanmamış / ertelenmiş) null.
 */
export type H2hWinner = 'home' | 'away' | 'draw';

function parsePair(raw: string | undefined | null): [number, number] | null {
  const m = /^\s*(\d+)\s*[-–]\s*(\d+)\s*$/.exec(raw ?? '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

export function h2hWinner(score: string | undefined | null, psScore?: string | null): H2hWinner | null {
  const s = parsePair(score);
  if (!s) return null;
  if (s[0] !== s[1]) return s[0] > s[1] ? 'home' : 'away';
  const p = parsePair(psScore);
  if (p && p[0] !== p[1]) return p[0] > p[1] ? 'home' : 'away';
  return 'draw';
}

/** Karşılaşma geçmişinde arama motorunun izleyeceği (normal bağlantılı) en yeni maç sayısı. */
export const H2H_FOLLOWED_LINKS = 10;

/**
 * Karşılaşma geçmişinin en yeni `limit` maçının id'leri (tarihe göre; sıra Sportmonks'tan bağımsız). Eski satırlar
 * `rel="nofollow"` bağlantı: kullanıcı yine tıklar, tarayıcı botlar her maç sayfasından yüzlerce eski maça (her biri yeni
 * Sportmonks isteği; çoğu eski UEFA sezonu, belirsiz id bölgesi) inmez.
 */
export function h2hFollowedIds(rows: readonly { id: string; date?: string; scheduled?: string }[], limit = H2H_FOLLOWED_LINKS): Set<string> {
  const key = (r: { date?: string; scheduled?: string }) => `${r.date ?? ''} ${r.scheduled ?? ''}`;
  return new Set([...rows].sort((a, b) => key(b).localeCompare(key(a))).slice(0, limit).map((r) => r.id));
}
