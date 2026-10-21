/**
 * Elle test: belirli bir maç için gol ya da maç sonu tweet'ini üretir (ve istenirse atar). Poller'dan bağımsız;
 * mükerrer işareti koymaz (test amaçlı, bilerek tekrarlanabilir).
 */
import { buildGoalDraft } from '@/lib/gundem/bot/goalDraft';
import { goalKindOf, sortEvents } from '@/lib/gundem/bot/goalStanding';
import { resolveLiveMatch } from '@/lib/resolveLiveMatch';
import { sportmonksClientRequest } from '@/services/sportmonksRuntimeClient';
import type { SportmonksFixture } from '@/services/sportmonks/types';
import { defaultXTickDeps, finalFactsOf } from './tick';
import { renderFinalTweet, renderGoalTweet } from './templates';

export type ManualTweet = { text: string; image: Buffer | null };

export async function buildManualTweet(kind: 'goal' | 'final', fixtureId: number, minute?: number): Promise<ManualTweet> {
  if (kind === 'final') {
    const resolved = await resolveLiveMatch(String(fixtureId));
    if (!resolved) throw new Error('Maç bulunamadı.');
    const facts = finalFactsOf(resolved);
    if (!facts) throw new Error('Maç skoru yok (bitmemiş olabilir).');
    return { text: renderFinalTweet(facts), image: await defaultXTickDeps.renderImage(resolved.match) };
  }
  const { data: fixture } = await sportmonksClientRequest<SportmonksFixture>('football', `/fixtures/${fixtureId}`, {
    include: 'participants;league;events',
  });
  if (!fixture) throw new Error('Maç bulunamadı.');
  const goals = sortEvents((fixture.events ?? []).filter((e) => goalKindOf(e) !== null));
  const goal = minute == null ? goals[goals.length - 1] : goals.find((g) => g.minute === minute);
  if (!goal) throw new Error(minute == null ? 'Maçta gol yok.' : `${minute}. dakikada gol yok.`);
  const draft = buildGoalDraft({ fixture, eventId: goal.id, scorers: null });
  if (!draft.ok) throw new Error(`Gol verisi eksik: ${draft.reason}`);
  return { text: renderGoalTweet(draft.facts, fixture.id + goal.minute), image: null };
}
