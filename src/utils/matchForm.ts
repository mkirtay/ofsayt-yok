/** `urls.head2head` içinden team1_id / team2_id (yoksa null) */
export function parseHead2HeadTeamIds(head2headUrl: string | undefined): {
  team1Id: string;
  team2Id: string;
} | null {
  if (!head2headUrl?.trim()) return null;
  try {
    const base = head2headUrl.startsWith('http') ? undefined : 'https://livescore-api.com';
    const u = new URL(head2headUrl, base);
    const t1 = u.searchParams.get('team1_id');
    const t2 = u.searchParams.get('team2_id');
    if (t1 && t2) return { team1Id: t1, team2Id: t2 };
  } catch {
    /* ignore */
  }
  return null;
}

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
 * Maç kartının form/karşılaşma verisi için takım çifti (SSR ve istemci aynı çifti kullansın). Eski sağlayıcının
 * head2head URL'si varsa ondan, yoksa ev/deplasman id'leri. Takımlar bilinmiyorsa null.
 */
export function h2hTeamKey(
  match: { home?: { id?: number }; away?: { id?: number }; urls?: { head2head?: string } } | null | undefined,
): { team1Id: string; team2Id: string; key: string } | null {
  if (!match?.home?.id || !match?.away?.id) return null;
  const parsed = parseHead2HeadTeamIds(match.urls?.head2head);
  const team1Id = parsed?.team1Id ?? String(match.home.id);
  const team2Id = parsed?.team2Id ?? String(match.away.id);
  return { team1Id, team2Id, key: `${team1Id}:${team2Id}` };
}

