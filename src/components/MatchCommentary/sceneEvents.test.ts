import { describe, expect, it } from 'vitest';
import { normalizeCommentary, type RawComment } from '@/services/sportmonks/matchCommentary';
import { resolveSceneSides } from '@/services/sportmonks/commentaryScene';
import { buildSceneEvents, nextRun, sameActor, scoreIn, type SceneEvent } from './sceneEvents';

/** Gerçek satırlar: Fenerbahçe–Beşiktaş 19746621 (2026-10, getscor3 /api/matches/19746621/commentary). */
const FB_BJK: RawComment[] = [
  { id: 11195886, order: 18, minute: 26, comment: 'Goal! Milan Skriniar scores to make it 1-0.', is_goal: true },
  { id: 11195903, order: 19, minute: 26, comment: 'Milan Skriniar scores with a left-footed shot.' },
  { id: 11196201, order: 23, minute: 36, comment: 'Offside.' },
  { id: 11196202, order: 24, minute: 38, comment: 'Goal! Ridvan Yilmaz scores to make it 1-1, assisted by Leandro Trossard.', is_goal: true },
  { id: 11196236, order: 25, minute: 38, comment: 'Shot by Ridvan Yilmaz with his left foot results in a goal.' },
  { id: 11196237, order: 26, minute: 41, comment: 'Goal! The score is now 2-1.', is_goal: true },
  { id: 11196292, order: 27, minute: 41, comment: 'Offside.' },
  { id: 11196458, order: 31, minute: null, comment: 'The first half ends with the score at 1-1.' },
  { id: 11197697, order: 48, minute: 73, comment: 'Goal! Dusan Vlahovic scores to make it 1-2, assisted by Orkun Kokcu.', is_goal: true },
  { id: 11197711, order: 49, minute: 73, comment: 'Dusan Vlahovic takes a shot with his left foot and scores.' },
  { id: 11197744, order: 50, minute: 75, comment: 'Orkun Kokcu takes a left-footed shot, but it is blocked.' },
  { id: 11197832, order: 55, minute: 81, comment: 'Leandro Trossard takes a left-footed shot that hits the post.' },
];

const events = (rows: RawComment[]) => buildSceneEvents(resolveSceneSides(normalizeCommentary(rows), null));

describe('buildSceneEvents — aynı golün iki satırı', () => {
  it('Vlahovic 73′: "Goal!" + vuruş satırı tek olay, iki satır da ona bağlı', () => {
    const { byItemId } = events(FB_BJK);
    const a = byItemId.get(11197697)!;
    const b = byItemId.get(11197711)!;
    expect(a).toBe(b);
    expect(a.ids).toEqual([11197697, 11197711]);
    expect(a.key).toBe('e11197697');
    expect(a.item.scene.type).toBe('goal');
    // Birleşen sahne: taraf skor satırından, asist "Goal!" satırından.
    expect(a.item.scene.side).toBe('away');
    expect(a.item.scene.assist).toBe('Orkun Kokcu');
    expect(a.disallowed).toBe(false);
  });

  it('her gol bir olay; bağımsız şutlar ayrı kalır', () => {
    const { events: list } = events(FB_BJK);
    const goals = list.filter((e) => e.item.scene.type === 'goal');
    expect(goals.map((g) => g.ids.length)).toEqual([2, 2, 2]);
    expect(list.filter((e) => e.item.scene.type !== 'goal')).toHaveLength(2);
    // En yeni üstte.
    expect(list[0]!.item.minute).toBe(81);
  });

  it('aynı dakikada farklı oyuncunun golleri birleşmez', () => {
    const { events: list } = events([
      { id: 1, order: 1, minute: 50, comment: 'Goal! Milan Skriniar scores to make it 1-0.', is_goal: true },
      { id: 2, order: 2, minute: 50, comment: 'Goal! Dusan Vlahovic scores to make it 1-1.', is_goal: true },
    ]);
    expect(list).toHaveLength(2);
  });

  it('aynı dakikadaki iki bağımsız şut birleşmez', () => {
    const { events: list } = events([
      { id: 1, order: 1, minute: 19, comment: 'Shot by Oguz Aydin with his right foot is blocked.' },
      { id: 2, order: 2, minute: 19, comment: 'Ngolo Kante takes a right-footed shot, but it is blocked.' },
    ]);
    expect(list).toHaveLength(2);
  });

  it('skoru çelişen iki gol satırı birleşmez', () => {
    const { events: list } = events([
      { id: 1, order: 1, minute: 60, comment: 'Goal! Milan Skriniar scores to make it 1-0.', is_goal: true },
      { id: 2, order: 2, minute: 60, comment: 'Goal! Milan Skriniar scores to make it 2-0.', is_goal: true },
    ]);
    expect(list).toHaveLength(2);
  });

  it('canlı yenilemede aynı satırlar → aynı anahtar ve imza (sahne sıfırlanmaz)', () => {
    const a = events(FB_BJK).events.map((e) => [e.key, e.sig]);
    const b = events(FB_BJK.map((r) => ({ ...r }))).events.map((e) => [e.key, e.sig]);
    expect(b).toEqual(a);
  });
});

describe('buildSceneEvents — onaylanmamış gol', () => {
  it('VAR iptal satırı gelen gol iptal işaretlenir, imza değişir', () => {
    const goal: RawComment = { id: 10, order: 10, minute: 60, comment: 'Goal! Milan Skriniar scores to make it 1-0.', is_goal: true };
    const before = events([goal]).events[0]!;
    const after = events([goal, { id: 11, order: 11, minute: 62, comment: 'VAR Decision: Goal Disallowed for offside against Milan Skriniar.' }]).events[0]!;
    expect(before.disallowed).toBe(false);
    expect(after.key).toBe(before.key);
    expect(after.disallowed).toBe(true);
    expect(after.sig).not.toBe(before.sig);
  });

  it('sonraki skor daha düşükse (gol geri alındı) iptal sayılır', () => {
    const { events: list } = events([
      { id: 1, order: 1, minute: 40, comment: 'Goal! Milan Skriniar scores to make it 2-1.', is_goal: true },
      { id: 2, order: 2, minute: null, comment: 'The first half ends with the score at 1-1.' },
    ]);
    expect(list[0]!.disallowed).toBe(true);
  });

  it('sonraki gol skoru artırıyorsa iptal değil', () => {
    const { byItemId } = events(FB_BJK);
    expect(byItemId.get(11195886)!.disallowed).toBe(false);
    expect(byItemId.get(11196202)!.disallowed).toBe(false);
  });
});

describe('yardımcılar', () => {
  it('sameActor: soyad / alt küme; ad yoksa belirsiz', () => {
    expect(sameActor('Dusan Vlahovic', 'Vlahovic')).toBe(true);
    expect(sameActor('Dušan Vlahović', 'Dusan Vlahovic')).toBe(true);
    expect(sameActor('Milan Skriniar', 'Dusan Vlahovic')).toBe(false);
    expect(sameActor(undefined, 'Dusan Vlahovic')).toBeNull();
  });

  it('scoreIn: satırdaki son skor', () => {
    expect(scoreIn('Goal! Dusan Vlahovic scores to make it 1-2, assisted by Orkun Kokcu.')).toEqual([1, 2]);
    expect(scoreIn('Corner awarded.')).toBeNull();
  });
});

describe('nextRun — oynatma kararı', () => {
  const ev = (key: string, sig = 's'): SceneEvent => ({ key, sig }) as SceneEvent;
  const cur = { event: ev('e1'), n: 3 };

  it('aynı olay aynı imzayla tekrar gelirse sahne aynen sürer', () => {
    expect(nextRun(cur, ev('e1'), { replay: false, follow: true, busy: true }).run).toBe(cur);
  });
  it('aynı olay düzeltilirse (imza değişti) yeniden planlanır', () => {
    expect(nextRun(cur, ev('e1', 's2'), { replay: false, follow: true, busy: true }).run.n).toBe(4);
  });
  it('canlı takipte oynayan sahne kesilmez, yeni olay bekletilir', () => {
    const r = nextRun(cur, ev('e2'), { replay: false, follow: true, busy: true });
    expect(r.run).toBe(cur);
    expect(r.pending?.key).toBe('e2');
  });
  it('sahne bittiyse ya da kullanıcı seçtiyse yeni olay hemen', () => {
    expect(nextRun(cur, ev('e2'), { replay: false, follow: true, busy: false }).run.event.key).toBe('e2');
    expect(nextRun(cur, ev('e2'), { replay: false, follow: false, busy: true }).run.event.key).toBe('e2');
  });
  it('tekrar oynat: aynı olay baştan, bekleyen temizlenir', () => {
    const r = nextRun(cur, ev('e1'), { replay: true, follow: false, busy: true });
    expect(r.run.n).toBe(4);
    expect(r.pending).toBeNull();
  });
});
