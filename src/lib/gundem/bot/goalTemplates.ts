/**
 * Gol post'u metni — DÜZ template-string. LLM/serbest metin üretimi YOK: çıktıdaki her sayı/isim `GoalFacts`'ten gelir,
 * veri eksikse ilgili cümle HİÇ yazılmaz (uydurma yok). Metin Türkçe; lig adına ek getirilmez (ek uyumu riski) —
 * cümleler "… gol krallığında" / "… sezonunun" kalıplarıyla kurulur.
 */
import type { GoalKind, GoalMilestone } from './goalStanding';

export type GoalFacts = {
  kind: GoalKind;
  playerName: string;
  /** Golü atan takım (kendi kalesine golde bilinmez → null). */
  teamName: string | null;
  minute: number;
  extraMinute: number | null;
  homeName: string;
  awayName: string;
  /** null → skor güvenilmez (kendi kalesine gol vb.), satır yazılmaz. */
  score: { home: number; away: number } | null;
  leagueName: string | null;
  /** null → sıralama verisi yok, istatistik cümlesi yazılmaz. */
  milestone: GoalMilestone | null;
};

export function formatMinute(minute: number, extraMinute: number | null): string {
  return extraMinute && extraMinute > 0 ? `${minute}+${extraMinute}'` : `${minute}'`;
}

export function standingSentence(playerName: string, leagueName: string | null, m: GoalMilestone | null): string | null {
  if (!m || m.kind === 'none' || !leagueName) return null;
  switch (m.kind) {
    case 'took-lead':
      return `Bu golle ${playerName}, ${leagueName} sezonunun en çok gol atan oyuncusu oldu (${m.goals} gol).`;
    case 'joint-lead':
      return `${playerName}, ${m.goals} golle ${leagueName} gol krallığında ortak lider.`;
    case 'extended-lead':
      return `${playerName}, ${m.goals} golle ${leagueName} gol krallığında liderliğini sürdürüyor.`;
    case 'top-rank':
      return `${playerName}, ${m.goals} golle ${leagueName} gol krallığında ${m.rank}. sırada.`;
  }
}

export function renderGoalPost(f: GoalFacts): string {
  const min = formatMinute(f.minute, f.extraMinute);
  const lines: string[] = [];

  if (f.kind === 'own-goal') {
    lines.push(`⚽ ${min} ${f.playerName} kendi kalesine attı.`);
  } else {
    const tag = f.kind === 'penalty' ? 'GOL (P)' : 'GOL';
    lines.push(`⚽ ${tag}! ${min} ${f.playerName}${f.teamName ? ` (${f.teamName})` : ''}`);
  }
  if (f.score) lines.push(`${f.homeName} ${f.score.home}-${f.score.away} ${f.awayName}`);

  // Kendi kalesine golde golcü kredisi yok → istatistik cümlesi yok (milestone zaten null gelir; ikinci güvence).
  const stat = f.kind === 'own-goal' ? null : standingSentence(f.playerName, f.leagueName, f.milestone);
  if (stat) lines.push(stat);

  return lines.join('\n');
}
