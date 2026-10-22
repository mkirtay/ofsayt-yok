import { describe, expect, it } from 'vitest';
import { hasEnglishLeftover, maskNames, parseCommentLine } from './commentaryParse';
import multiLeague from './__fixtures__/commentaryMultiLeague.json';

const tr = (line: string) => parseCommentLine(line)?.tr ?? null;

describe('maskNames', () => {
  it('oyuncu/takım adlarını bağlaçlarıyla tek parça maskeler; cümle başı anahtar kelimeleri ad saymaz', () => {
    expect(maskNames('Foul committed by Sydney van Hooijdonk of PEC Zwolle.')).toEqual({
      text: 'Foul committed by @0 of @1.',
      names: ['Sydney van Hooijdonk', 'PEC Zwolle'],
    });
    expect(maskNames('On Ran Binyamin, off Herman Johansson.').names).toEqual(['Ran Binyamin', 'Herman Johansson']);
    expect(maskNames("Attempt blocked. Jakub Piotrowski's header is blocked.").text).toBe("Attempt blocked. @0's header is blocked.");
    expect(maskNames('Goal! Brighton and Hove Albion lead Crystal Palace 2-0.').names).toEqual(['Brighton and Hove Albion', 'Crystal Palace']);
    // Takım adındaki yıl/0'lı sayı adın parçası, skor değil
    expect(maskNames('The score is now Mardin 1969 2, Bayer 04 Leverkusen 1.').names).toEqual(['Mardin 1969', 'Bayer 04 Leverkusen']);
  });
});

describe('parseCommentLine — kullanıcının ekran görüntüsü (Kairat–Panathinaikos, 2026-10-22)', () => {
  it.each([
    ['Offside called against Kairat. Azamat Tuyakbayev is caught in an offside position.', 'Ofsayt: Azamat Tuyakbayev (Kairat).'],
    ['Azamat Tuyakbayev from Kairat wins a free kick in the attacking half.', 'Azamat Tuyakbayev (Kairat) rakip yarı sahada serbest vuruş kazandı.'],
    ['Imrân Louza from Panathinaikos commits a foul.', 'Imrân Louza (Panathinaikos) faul yaptı.'],
    // Eski çeviri burada "Goal! Panathinaikos leads Kairat 3-0. Cyriel Dessers sol ayakla golü attı." diye yarım kalıyordu.
    [
      'Goal! Panathinaikos leads Kairat 3-0. Cyriel Dessers scores with a left-footed shot from the left side of the box into the top left corner, assisted by Andrews Tetteh with a through ball following a fast break.',
      'GOL! Cyriel Dessers ceza sahasının solundan sol ayakla sol üst köşeye golü attı (asist: Andrews Tetteh – ara pası, hızlı hücumda). Skor: Panathinaikos 3-0 Kairat.',
    ],
  ])('%s', (en, expected) => {
    expect(tr(en)).toBe(expected);
  });
});

describe('parseCommentLine — kalıp aileleri', () => {
  it.each([
    ['Foul committed by Sydney van Hooijdonk of PEC Zwolle.', 'Sydney van Hooijdonk (PEC Zwolle) faul yaptı.', 'foul'],
    ['Enzo Ebosse commits a foul for Udinese.', 'Enzo Ebosse (Udinese) faul yaptı.', 'foul'],
    ['Willem Geubbels from Lecce commits a handball.', 'Willem Geubbels (Lecce) elle oynadı.', 'foul'],
    ['Ryan Thomas from PEC Zwolle wins a free kick in the defensive half.', 'Ryan Thomas (PEC Zwolle) kendi yarı sahasında serbest vuruş kazandı.', 'free_kick'],
    ['Danilo Veiga from Lecce wins a free kick on the right wing.', 'Danilo Veiga (Lecce) sağ kanatta serbest vuruş kazandı.', 'free_kick'],
    ['PEC Zwolle wins a corner after Joris Kramer concedes.', 'PEC Zwolle korner kazandı (kornere gönderen: Joris Kramer).', 'corner'],
    ['Corner awarded to PEC Zwolle after a concession by Joris Kramer.', 'PEC Zwolle korner kazandı (kornere gönderen: Joris Kramer).', 'corner'],
    ['Simon Graves of PEC Zwolle is caught offside.', 'Ofsayt: Simon Graves (PEC Zwolle).', 'offside'],
    ['Lecce is called offside as Willem Geubbels is caught in an offside position.', 'Ofsayt: Willem Geubbels (Lecce).', 'offside'],
    ['Arda Çolak from Iğdır receives a yellow card for a bad foul.', 'Arda Çolak (Iğdır) sarı kart gördü (sert faul).', 'card'],
    ['Yellow card for Iago Amaral Borduchi.', 'Iago Amaral Borduchi sarı kart gördü.', 'card'],
    ['The fourth official has indicated there will be 3 minutes of added time.', 'Dördüncü hakem 3 dakika uzatma gösterdi.', 'update'],
    ['The match is delayed due to an injury to Sherel Floranus from PEC Zwolle.', 'Sherel Floranus (PEC Zwolle) sakatlandı, oyun durdu.', 'update'],
    ['Delay is over, and they are ready to continue.', 'Oyun yeniden başladı.', 'update'],
    ['First half begins.', 'İlk yarı başladı.', 'update'],
    ['The second half begins with the score at Iğdır 0, Boluspor 0.', 'İkinci yarı başladı: Iğdır 0-0 Boluspor.', 'update'],
    ['The first half ends with PEC Zwolle trailing Go Ahead Eagles 0-1.', 'İlk yarı sona erdi: PEC Zwolle 0-1 Go Ahead Eagles.', 'update'],
    ['The match ends with Udinese losing 0-3 to Lecce.', 'Maç sona erdi: Udinese 0-3 Lecce.', 'update'],
    ['Penalty awarded to Osasuna as Ante Budimir is fouled in the penalty area.', 'Osasuna penaltı kazandı; ceza sahasında faule uğrayan: Ante Budimir.', 'penalty'],
    ['Seymour Garfield Reid is substituted for Taylor Calheira.', 'Oyuna Seymour Garfield Reid girdi, Taylor Calheira çıktı.', 'substitution'],
    ['Substitution for PEC Zwolle: Damian van der Haar comes on for Sherel Floranus due to an injury.', 'PEC Zwolle: Oyuna Damian van der Haar girdi, Sherel Floranus çıktı.', 'substitution'],
    ['Goal in the penalty shootout! Petar Musa scores, making it 0-2.', 'Penaltı atışları: Petar Musa attı, skor 0-2.', 'goal'],
    ['Goal! An own goal by Raphael Canut makes it 2-0.', 'GOL! Kendi kalesine gol: Raphael Canut, skor 2-0.', 'goal'],
    [
      'Attempt missed. Stefán Sigurdarson from Go Ahead Eagles takes a left-footed shot from outside the box, but it goes high and wide to the left.',
      'Stefán Sigurdarson (Go Ahead Eagles) ceza sahası dışından sol ayakla vurdu, top üstten ve soldan auta çıktı.',
      'shot',
    ],
    [
      "Attempt blocked. Jakub Piotrowski's header from the center of the box is blocked. He was assisted by Juan Arizala's cross.",
      'Jakub Piotrowski ceza sahası içinden kafayla vurdu, savunmaya takıldı (asist: Juan Arizala – orta).',
      'shot',
    ],
    [
      'Goal! Go Ahead Eagles take the lead 1-0 as Stefán Sigurdarson scores with a header from very close range into the top right corner.',
      'GOL! Stefán Sigurdarson altıpastan kafayla sağ üst köşeye golü attı. Go Ahead Eagles öne geçti: Go Ahead Eagles 1-0.',
      'goal',
    ],
  ])('%s', (en, expected, kind) => {
    const p = parseCommentLine(en);
    expect(p?.tr).toBe(expected);
    expect(p?.event.kind).toBe(kind);
  });

  it('"center of the goal" gol sayılmaz (eski hata: kurtarılan şut "golü attı" oluyordu)', () => {
    expect(
      tr("Attempt saved. Dogan Erdogan's header from the left side of the box is saved in the center of the goal by Angelo Tafas. The assist comes from Soner Gönül."),
    ).toBe('Dogan Erdogan ceza sahasının solundan kafayla vurdu, kaleci Angelo Tafas kurtardı (asist: Soner Gönül).');
  });

  it('tanınmayan cümle içeren satır tamamen null (yarım çeviri yok)', () => {
    expect(tr('Foul committed by Kaiki of Como. What a strange day at the stadium.')).toBeNull();
    expect(tr('Mattia Liberali from Como has a left-footed shot from the center of the box that bounces around wildly.')).toBeNull();
  });
});

describe('gerçek veri — 20+ lig, kalıp başına bir örnek', () => {
  const lines = (multiLeague as { lines: string[] }).lines;
  const parsed = lines.map((line) => ({ line, p: parseCommentLine(line) }));

  it('kalıpların en az %85’i çevriliyor (2026-10-22: kalıp %87, satır ağırlıklı %97,5)', () => {
    const ok = parsed.filter((x) => x.p).length;
    expect(ok / lines.length).toBeGreaterThan(0.85);
  });

  it('hiçbir çeviride İngilizce kalıntı yok', () => {
    const mixed = parsed.filter((x) => x.p && hasEnglishLeftover(x.p.tr, maskNames(x.line).names)).map((x) => x.line);
    expect(mixed).toEqual([]);
  });
});
