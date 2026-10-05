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
