export type FormPill = { letter: string; variant: 'win' | 'draw' | 'loss' };

/**
 * `overall_form` / `h2h_form`: en güncel genelde dizinin başında; son `count` maç alınır, ters çevrilir
 * (solda en eski, sağda en yeni). W→G, D→B, L→M
 */
export function overallFormToPills(form: string[] | undefined, count = 5): FormPill[] {
  if (!form?.length) return [];
  return [...form.slice(0, count)].reverse().map((raw) => {
    const k = String(raw).toUpperCase();
    if (k === 'W') return { letter: 'G', variant: 'win' as const };
    if (k === 'D') return { letter: 'B', variant: 'draw' as const };
    if (k === 'L') return { letter: 'M', variant: 'loss' as const };
    return { letter: '?', variant: 'draw' as const };
  });
}

/**
 * Maç kartının form/karşılaşma verisi için takım çifti (SSR ve istemci aynı çifti kullansın): ev/deplasman id'leri.
 * Takımlar bilinmiyorsa null.
 */
export function h2hTeamKey(
  match: { home?: { id?: number }; away?: { id?: number } } | null | undefined,
): { team1Id: string; team2Id: string; key: string } | null {
  if (!match?.home?.id || !match?.away?.id) return null;
  const team1Id = String(match.home.id);
  const team2Id = String(match.away.id);
  return { team1Id, team2Id, key: `${team1Id}:${team2Id}` };
}

