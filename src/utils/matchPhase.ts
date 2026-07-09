export type MatchPhase = 'PRE' | 'LIVE' | 'HT' | 'POST';

/** Maç API durumundan basit faz türetir (frontend'de buton/rozet gösterimi için). */
export function deriveMatchPhase(status?: string | null): MatchPhase {
  const s = (status ?? '').toUpperCase();
  if (s === 'FINISHED' || s === 'FT' || s === 'FULL TIME' || s === 'ENDED') return 'POST';
  if (s === 'HALF TIME BREAK' || s === 'HT') return 'HT';
  if (s === 'NOT STARTED' || s === 'SCHEDULED' || s === '') return 'PRE';
  return 'LIVE';
}
