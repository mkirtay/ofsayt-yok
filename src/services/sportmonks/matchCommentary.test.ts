import { describe, expect, it } from 'vitest';
import sample from './__fixtures__/commentarySuperLig.json';
import { cleanCommentText, normalizeCommentary, translateCommentary, type RawComment } from './matchCommentary';

// Gerçek yanıtlar (2026-10-21, `fixtures/{id}?include=comments`): Gençlerbirliği–Galatasaray 19746587, Amed–Konya 19746588,
// Kasımpaşa–Samsunspor 19746590 — 202 satır.
const matches = sample as Record<string, RawComment[]>;
const tr = (comment: string, extra: Partial<RawComment> = {}) => translateCommentary({ id: 1, comment, ...extra });

describe('normalizeCommentary — gerçek Süper Lig örneği', () => {
  it.each(Object.keys(matches))('%s: her satır Türkçeye çevrilir ve tür bulunur', (id) => {
    const items = normalizeCommentary(matches[id]);
    expect(items).toHaveLength(matches[id]!.length);
    expect(items.filter((i) => !i.tr).map((i) => i.en)).toEqual([]);
    expect(items.filter((i) => i.kind === 'other')).toEqual([]);
  });

  it('en yeni üstte (order azalan); dakikasız satırlar (maç sonu) yerinde kalır', () => {
    const items = normalizeCommentary(matches['19746587']);
    expect(items[0]!.tr).toBe('Maç 0-1 sona erdi.');
    expect(items[0]!.minute).toBeNull();
    expect(items.at(-1)!.tr).toBe('Maç başladı! Hakem: Resat Onur Coskunses.');
    for (let i = 1; i < items.length; i++) expect(items[i - 1]!.order).toBeGreaterThan(items[i]!.order);
  });

  it('uzatma dakikası ayrı alanda; 0 uzatma yok sayılır', () => {
    const items = normalizeCommentary([
      { id: 1, comment: 'Corner awarded.', minute: 90, extra_minute: 4, order: 2 },
      { id: 2, comment: 'Offside.', minute: 30, extra_minute: 0, order: 1 },
    ]);
    expect(items.map((i) => [i.minute, i.extraMinute])).toEqual([[90, 4], [30, null]]);
  });

  it('gol satırları önemli; Sportmonks is_important da önemli', () => {
    const items = normalizeCommentary(matches['19746587']);
    const important = items.filter((i) => i.important).map((i) => i.kind);
    expect(important).toContain('goal');
    expect(items.filter((i) => i.kind === 'goal').every((i) => i.important)).toBe(true);
  });

  it('bahis dili içeren satır atılır, id\'siz/boş satır atılır', () => {
    const items = normalizeCommentary([
      { id: 1, comment: 'The odds were against them.', order: 3 },
      { id: 2, comment: '   ', order: 2 },
      { comment: 'Offside.', order: 1 },
      { id: 4, comment: 'Offside.', order: 0 },
    ]);
    expect(items.map((i) => i.id)).toEqual([4]);
  });
});

describe('translateCommentary — kalıplar', () => {
  it.each([
    ['Salih Ucan takes a right-footed shot, but it is saved.', 'Salih Ucan sağ ayakla vurdu, kaleci kurtardı.', 'shot'],
    ["Kerem Demirbay takes a left-footed shot, but it's saved.", 'Kerem Demirbay sol ayakla vurdu, kaleci kurtardı.', 'shot'],
    ['Leroy Sane takes a left-footed shot but misses.', 'Leroy Sane sol ayakla vurdu, isabet yok.', 'shot'],
    ["Franco Tongya's right-footed shot is blocked.", 'Franco Tongya sağ ayakla vurdu, savunmaya takıldı.', 'shot'],
    ["Metehan Baltaci's header is blocked.", 'Metehan Baltaci kafayla vurdu, savunmaya takıldı.', 'shot'],
    ['Elliot Watt takes a right-footed shot that hits the post.', 'Elliot Watt sağ ayakla vurdu, top direkten döndü.', 'shot'],
    ['Shot by Mbaye Diagne with a header results in a goal.', 'Mbaye Diagne kafayla golü attı.', 'shot'],
    ['Adem Arous scores with a right-footed shot.', 'Adem Arous sağ ayakla golü attı.', 'shot'],
    ['Shot - Gift Emmanuel Orban Head Shot Missed', 'Gift Emmanuel Orban kafayla vurdu, isabet yok.', 'shot'],
    ["Matei Ilie takes a shot, but it's blocked.", 'Matei Ilie vurdu, savunmaya takıldı.', 'shot'],
    ['Goal! Adem Arous scores to make it 2-0, assisted by Adrian Benedyczak.', 'GOL! Adem Arous attı, skor 2-0 (asist: Adrian Benedyczak).', 'goal'],
    ['Goal! Adrian Benedyczak scores, assisted by Kerem Demirbay. The score is now 4-1.', 'GOL! Adrian Benedyczak attı, skor 4-1 (asist: Kerem Demirbay).', 'goal'],
    ['Goal! Tanguy Coulibaly scores, bringing the match to 2-2.', 'GOL! Tanguy Coulibaly attı, skor 2-2.', 'goal'],
    ['Own goal by Irfan Can Egribayat puts the score at 0-1.', 'Kendi kalesine gol: Irfan Can Egribayat, skor 0-1.', 'goal'],
    ['Victor James Osimhen receives a yellow card.', 'Victor James Osimhen sarı kart gördü.', 'card'],
    ['Yellow card issued to Furkan Soyalp.', 'Furkan Soyalp sarı kart gördü.', 'card'],
    ['Mbaye Diagne receives a red card.', 'Mbaye Diagne kırmızı kart gördü.', 'card'],
    ['Deniz Gül comes on for Rafael Leao.', 'Oyuna Deniz Gül girdi, Rafael Leao çıktı.', 'substitution'],
    ['Ismail Jakobs is on, and Eren Elmali is off.', 'Oyuna Ismail Jakobs girdi, Eren Elmali çıktı.', 'substitution'],
    ['On for Afonso Sousa, off goes Emre Kilinc.', 'Oyuna Afonso Sousa girdi, Emre Kilinc çıktı.', 'substitution'],
    ['Mbaye Diagne is substituted off for Gift Emmanuel Orban.', 'Oyuna Gift Emmanuel Orban girdi, Mbaye Diagne çıktı.', 'substitution'],
    ['Corner awarded.', 'Korner.', 'corner'],
    ['Offside.', 'Ofsayt.', 'offside'],
    ['VAR decision: Goal disallowed for offside against Tanguy Coulibaly.', 'VAR kararı: gol ofsayt nedeniyle iptal edildi (Tanguy Coulibaly).', 'var'],
    ['First half ends with a score of 2-1.', 'İlk yarı 2-1 sona erdi.', 'update'],
  ])('%s', (en, expected, kind) => {
    expect(tr(en)).toEqual({ en, tr: expected, kind });
  });

  it('tanınmayan cümle: tr null, tür anahtar kelimeden', () => {
    expect(tr('Penalty to Galatasaray after a red card review.')).toMatchObject({ tr: null, kind: 'card' });
    expect(tr('Something unusual happens.', { minute: 50 })).toMatchObject({ tr: null, kind: 'other' });
    expect(tr('Drinks break.', { minute: null })).toMatchObject({ tr: null, kind: 'update' });
    expect(tr('A wild celebration follows.', { is_goal: true, minute: 12 })).toMatchObject({ tr: null, kind: 'goal' });
  });

  it('is_goal bayraklı "Goal!" satırı gol; vuruş satırı vuruş kalır', () => {
    expect(tr('Goal! Deniz Gül scores, making it 1-0.', { is_goal: true }).kind).toBe('goal');
    expect(tr('Shot - Adem Arous Head Shot Goal', { is_goal: true }).kind).toBe('shot');
  });
});

describe('cleanCommentText', () => {
  it('gerçek veride görülen CJK artığı ve fazla boşluk temizlenir', () => {
    expect(cleanCommentText('Shot - Irfan Can Egribayat Other Body Part Shot Own Goal球')).toBe(
      'Shot - Irfan Can Egribayat Other Body Part Shot Own Goal',
    );
    expect(cleanCommentText('  Deniz  Gül   ')).toBe('Deniz Gül');
  });
});
