/**
 * Anlatım satırı çözümleyici — Sportmonks `comments` metni (İngilizce) → yapılandırılmış olay + kural tabanlı Türkçe.
 *
 * Neden bileşenli: Sportmonks aynı olayı onlarca farklı cümleyle yazıyor (2026-10-22 ölçümü: 4 gün / 20+ lig / 6075 satırda 800+
 * ayrı kalıp; "Foul committed by X of T." / "X from T commits a foul." / "X commits a foul for T." …). Tam cümle kalıbı yerine:
 *
 *  1. Özel adlar (oyuncu/takım) `@0`, `@1`… yer tutucularıyla maskelenir (büyük harfli sözcük dizileri; "van", "de" gibi bağlaçlar dahil).
 *  2. Metin cümlelere bölünür; her cümle bir işleyiciyle eşleşmeli (faul, serbest vuruş, korner, ofsayt, kart, değişiklik, şut/gol,
 *     skor cümlesi, devre/uzatma bilgisi, VAR…). Şut cümlesi parça parça okunur (vuruş biçimi, bölge, top nereye gitti, asist, hücum
 *     türü) ve TANINMAYAN sözcük kalırsa reddedilir — anlamı düşen bir parça olmasın.
 *  3. Tek bir cümle bile tanınmazsa satırın tamamı İngilizce kalır (`null`): yarı Türkçe yarı İngilizce satır çıkmaz.
 *
 * Saf modül; sunucu ucu kullanır (istemci paketine girmez).
 */

export type ParsedKind = 'goal' | 'card' | 'shot' | 'corner' | 'offside' | 'substitution' | 'var' | 'update' | 'foul' | 'free_kick' | 'penalty' | 'other';

export type ShotOutcome = 'goal' | 'saved' | 'blocked' | 'post' | 'miss';

export type ParsedZone =
  | 'six_yard'
  | 'six_yard_left'
  | 'six_yard_right'
  | 'close'
  | 'box_centre'
  | 'box_left'
  | 'box_right'
  | 'outside_box'
  | 'long_range'
  | 'angle_left'
  | 'angle_right';

/** Satırdan çıkan olay bilgisi — sahne sınıflandırması (classifyScene) ve tür bunu kullanır. */
export type ParsedEvent = {
  kind: ParsedKind;
  /** Olayı yapan oyuncu (şutta vuran, faulde faul yapan, kartta kart gören, değişiklikte giren). */
  player?: string;
  /** İkinci oyuncu (değişiklikte çıkan, faulde faule uğrayan). */
  other?: string;
  /** Olayı yapan takım (metinde geçiyorsa). */
  team?: string;
  outcome?: ShotOutcome;
  body?: 'left' | 'right' | 'head';
  zone?: ParsedZone;
  ownGoal?: boolean;
  post?: boolean;
  card?: 'yellow' | 'red';
  /** Serbest vuruşun yeri. */
  where?: 'defensive_half' | 'attacking_half' | 'left_wing' | 'right_wing';
  /** Korner/serbest vuruş/penaltı/hızlı hücum bağlamı (sahne akışı için). */
  context?: 'corner' | 'fast_break' | 'free_kick' | 'set_piece' | 'penalty';
  assist?: string;
};

export type ParsedComment = { tr: string; event: ParsedEvent };

// ─── 1. Ad maskeleme ────────────────────────────────────────────────────────────────────────────────────────────────

const CAP = "\\p{Lu}[\\p{L}\\p{M}'’\\-]*";
const CONNECT = '(?:de|da|do|dos|das|del|della|dei|di|du|van|von|der|den|ter|te|le|la|el|al|bin|ibn|y|e|af|zu|mac|ben|bou)';
/** Takım adındaki sayı ("Bayer 04 Leverkusen", "Mardin 1969") — skor ("Iğdır 0") ad sayılmasın diye yalnız 4 hane ya da 0'lı 2 hane. */
const NUM = '(?:\\d{4}|0\\d)(?![\\d-])';
const NAME_RE = new RegExp(`${CAP}(?:\\s+(?:${CONNECT}\\s+)*(?:${CAP}|${NUM}))*`, 'gu');
/** "and" içeren bilinen adlar (maskede tek ad). */
const AND_NAMES = /\b(?:Brighton (?:and|&) Hove Albion|Bosnia and Herzegovina|Trinidad and Tobago|Antigua and Barbuda|Saint Kitts and Nevis|Sao Tome and Principe)\b/g;

/** Tek başına geçtiğinde ad olmayan büyük harfli sözcükler (cümle başı / anahtar kelime). */
const KEYWORDS = new Set(
  (
    'Attempt Shot Goal Own Offside Foul Fouls Delay Penalty Penalties VAR Corner Substitution The First Second Third Yellow Red He His Her It Its They Their ' +
    'Kick-off Match Half Free Fourth Assisted Header Handball Score Video Extra End Full Full-time Halftime Half-time A An On Off In After With Following ' +
    'Saved Blocked Missed Missing Shot! Lineups Drinks Injury There This That What Great Close Unlucky Despite Both Referee Players Goalkeeper Substitute ' +
    'Booking Card Cards Decision Review Overturned Disallowed Confirmed Play Restart Game Teams Team Hand Throw Kickoff Kick Ball Hits Post Crossbar Bar ' +
    'Wide High Over Long Right Left Centre Center Box Penalty-shootout Shootout Away Home Second-half First-half Added Time Minutes Minute'
  ).split(' '),
);

/** Ad dizisinin başına yapışabilen büyük harfli sözcükler ("On Ran Binyamin, Off Herman Johansson"). */
const LEAD_WORDS = new Set(['The', 'Shot', 'Attempt', 'On', 'Off', 'Substitution', 'Goal', 'Penalty', 'Corner', 'Offside', 'Foul', 'Free']);

type Masked = { text: string; names: string[] };

export function maskNames(input: string): Masked {
  const names: string[] = [];
  const put = (name: string) => {
    let i = names.indexOf(name);
    if (i < 0) i = names.push(name) - 1;
    return `@${i}`;
  };
  let text = input.replace(AND_NAMES, (m) => put(m));
  text = text.replace(NAME_RE, (raw) => {
    let run = raw;
    let suffix = '';
    const poss = run.match(/['’]s$|(?<=s)['’]$/);
    if (poss) {
      run = run.slice(0, -poss[0].length);
      suffix = "'s";
    }
    // Cümle başı "The X" → "The" ad değil.
    const words = run.split(/\s+/);
    while (words.length > 1 && LEAD_WORDS.has(words[0]!)) words.shift();
    const lead = run.slice(0, run.length - words.join(' ').length);
    const name = words.join(' ');
    if (words.length === 1 && KEYWORDS.has(name.replace(/!$/, ''))) return raw;
    if (/^[\p{Lu}]$/u.test(name)) return raw;
    return `${lead}${put(name)}${suffix}`;
  });
  return { text, names };
}

// ─── 2. Cümle işleyicileri ──────────────────────────────────────────────────────────────────────────────────────────

const P = '@(\\d+)';
/** Takım eki: "X from T", "X of T", "X (T)", "X for T". */
const TEAM = `(?:\\s+(?:from|of|for)\\s+@(\\d+)|\\s*\\(@(\\d+)\\))?`;
const SCORE = '(\\d+)\\s*-\\s*(\\d+)';

type Ctx = { names: string[] };
type Frag = { context?: (typeof CONTEXT)[number]; tr: string; event?: ParsedEvent; marker?: 'goal' | 'shot' | 'saved' | 'blocked' | 'missed' | 'shootout'; score?: string; assist?: string };

const nm = (ctx: Ctx, i: string | undefined) => (i == null ? undefined : ctx.names[Number(i)]);
const withTeam = (player: string, team?: string) => (team ? `${player} (${team})` : player);
const scoreOf = (a: string, b: string) => `${a}-${b}`;

const WHERE_TR: Record<NonNullable<ParsedEvent['where']>, string> = {
  defensive_half: 'kendi yarı sahasında',
  attacking_half: 'rakip yarı sahada',
  left_wing: 'sol kanatta',
  right_wing: 'sağ kanatta',
};

function whereOf(s: string): ParsedEvent['where'] | null {
  if (/^(?:in )?(?:the |their |his |its )?defensive half$/.test(s)) return 'defensive_half';
  if (/^(?:in )?(?:the |their |his |its )?attacking half$/.test(s)) return 'attacking_half';
  if (/^on the left(?: wing| flank)?$/.test(s)) return 'left_wing';
  if (/^on the right(?: wing| flank)?$/.test(s)) return 'right_wing';
  return null;
}

const CARD_REASON: ReadonlyArray<[RegExp, string]> = [
  [/^(?:a )?(?:bad|reckless|dangerous|late|rough|serious|professional|cynical) (?:foul|challenge|tackle)$/, 'sert faul'],
  [/^(?:a )?(?:foul|challenge|tackle|tactical foul)$/, 'faul'],
  [/^(?:a )?(?:deliberate )?hand ?ball$/, 'elle oynama'],
  [/^(?:excessive|over-the-top) celebration$/, 'aşırı sevinç'],
  [/^time[- ]wasting$/, 'zaman geçirme'],
  [/^(?:unsporting|unsportsmanlike) (?:behaviou?r|conduct)$/, 'sportmenliğe aykırı hareket'],
  [/^(?:dissent|arguing|an argument|arguing with the referee|protesting|protests)$/, 'itiraz'],
  [/^(?:simulation|diving|a dive)$/, 'yere kendini atma'],
  [/^(?:violent conduct|serious foul play)$/, 'şiddet içeren hareket'],
  [/^(?:a )?second yellow(?: card)?$/, 'ikinci sarı kart'],
  [/^(?:delaying|delaying the restart|kicking the ball away)$/, 'oyunu geciktirme'],
  [/^(?:encroachment|leaving the field|entering the field)(?: without permission)?$/, 'izinsiz saha giriş/çıkışı'],
];

function cardReason(s: string | undefined): string | null | undefined {
  if (!s) return undefined;
  for (const [re, tr] of CARD_REASON) if (re.test(s.toLowerCase())) return tr;
  return null;
}

const HALF_TR: Record<string, string> = { first: 'İlk yarı', second: 'İkinci yarı', 'first half': 'İlk yarı', 'second half': 'İkinci yarı', match: 'Maç', game: 'Maç' };

/** Skor durumu ifadesi ("with X leading Y 1-0", "with the score at 1-2", "in a 1-1 draw between X and Y") → "X 1-0 Y" / "1-2". */
function scoreState(s: string, ctx: Ctx): string | null {
  let m: RegExpMatchArray | null;
  const t = (i: string) => ctx.names[Number(i)];
  if ((m = s.match(new RegExp(`^(?:with )?(?:a|the) score (?:of |at )?${SCORE}$`)))) return scoreOf(m[1]!, m[2]!);
  if ((m = s.match(new RegExp(`^(?:with )?the score(?: at)? ${SCORE}$`)))) return scoreOf(m[1]!, m[2]!);
  if ((m = s.match(new RegExp(`^(?:with )?(?:the score at |the score )?${P},? (\\d+),? ${P},? (\\d+)$`)))) return `${t(m[1]!)} ${m[2]}-${m[4]} ${t(m[3]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?${P} (?:leading|winning|ahead of|beating)(?: against)? ${P} (?:by )?${SCORE}$`)))) return `${t(m[1]!)} ${m[3]}-${m[4]} ${t(m[2]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?${P} (?:leading|winning|ahead|losing|trailing) ${SCORE} (?:against|to|over|behind) ${P}$`)))) return `${t(m[1]!)} ${m[2]}-${m[3]} ${t(m[4]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?${P} (?:trailing|losing to|behind) ${P} ${SCORE}$`)))) return `${t(m[1]!)} ${m[3]}-${m[4]} ${t(m[2]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?${P} and ${P} (?:tied|level|drawing|locked) (?:at )?${SCORE}$`)))) return `${t(m[1]!)} ${m[3]}-${m[4]} ${t(m[2]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?the (?:match|game|score) (?:tied|level|finishing|ending) (?:at )?${SCORE} between ${P} and ${P}$`)))) return `${t(m[3]!)} ${m[1]}-${m[2]} ${t(m[4]!)}`;
  if ((m = s.match(new RegExp(`^(?:in )?a ${SCORE} (?:draw|tie) between ${P} and ${P}$`)))) return `${t(m[3]!)} ${m[1]}-${m[2]} ${t(m[4]!)}`;
  if ((m = s.match(new RegExp(`^(?:with )?${P} (?:winning|beating|defeating) ${P} ${SCORE}$`)))) return `${t(m[1]!)} ${m[3]}-${m[4]} ${t(m[2]!)}`;
  return null;
}

/** Devre/maç başlangıç-bitiş, uzatma, gecikme, başlama vuruşu. */
function infoSentence(s: string, ctx: Ctx): Frag | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^kick-off!?(?: the referee is @(\d+))?$/i))) {
    const ref = nm(ctx, m[1]);
    return { tr: ref ? `Maç başladı! Hakem: ${ref}.` : 'Maç başladı!', event: { kind: 'update' } };
  }
  if (/^the referee is @\d+$/i.test(s)) return { tr: `Hakem: ${nm(ctx, s.match(/@(\d+)/)![1])}.`, event: { kind: 'update' } };
  if ((m = s.match(/^(?:the )?(first|second) half (?:begins|starts|is underway|has begun|has started|gets underway|kicks off)(?:,? (.+))?$/i))) {
    const half = HALF_TR[m[1]!.toLowerCase()]!;
    if (!m[2]) return { tr: `${half} başladı.`, event: { kind: 'update' } };
    const st = scoreState(m[2], ctx);
    return st ? { tr: `${half} başladı: ${st}.`, event: { kind: 'update' } } : null;
  }
  if ((m = s.match(/^(?:the )?(first half|second half|match|game) (?:ends|is over|has ended|comes to an end|finishes|concludes)(?:,? (.+))?$/i)) || (m = s.match(/^(?:the )?(first|second) half ends(?:,? (.+))?$/i))) {
    const half = HALF_TR[m[1]!.toLowerCase()]!;
    if (!m[2]) return { tr: `${half} sona erdi.`, event: { kind: 'update' } };
    const st = scoreState(m[2], ctx);
    if (!st) return null;
    return { tr: /^\d+-\d+$/.test(st) ? `${half} ${st} sona erdi.` : `${half} sona erdi: ${st}.`, event: { kind: 'update' } };
  }
  if ((m = s.match(/^(?:the )?fourth official (?:has )?(?:indicated|announced|signals|shows|signalled|signaled)(?: that)? there (?:will be|are) (\d+) (?:minutes?|mins?) of (?:added|additional|stoppage|injury) time$/i))) {
    return { tr: `Dördüncü hakem ${m[1]} dakika uzatma gösterdi.`, event: { kind: 'update' } };
  }
  if ((m = s.match(/^(\d+) (?:minutes?|mins?) of (?:added|additional|stoppage|injury) time (?:will be played|to be played|are added|added|indicated)$/i))) {
    return { tr: `${m[1]} dakika uzatma.`, event: { kind: 'update' } };
  }
  if ((m = s.match(new RegExp(`^(?:the )?(?:match|game) is (?:delayed|stopped|paused|halted) (?:due to|because of|for) an injury to ${P}${TEAM}$`, 'i')))) {
    return { tr: `${withTeam(nm(ctx, m[1])!, nm(ctx, m[2] ?? m[3]))} sakatlandı, oyun durdu.`, event: { kind: 'update', player: nm(ctx, m[1]) } };
  }
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:is injured|picks up an injury|goes down injured|is down injured)(?:,? and the (?:match|game) is (?:delayed|stopped))?$`, 'i')))) {
    return { tr: `${withTeam(nm(ctx, m[1])!, nm(ctx, m[2] ?? m[3]))} sakatlandı, oyun durdu.`, event: { kind: 'update', player: nm(ctx, m[1]) } };
  }
  if (/^(?:there is a |a )?delay in (?:the )?(?:match|game)(?: (?:due to|because of|for) an injury)?(?: (?:in|involving) (?:the )?(?:match|game))?(?: (?:in|involving|for) @\d+(?: (?:and|vs\.?|v) @\d+)?)?$/i.test(s)) {
    return { tr: 'Oyun durdu.', event: { kind: 'update' } };
  }
  if (/^(?:the )?(?:match|game) is (?:delayed|stopped|paused)(?: (?:due to|because of|for) an injury)?$/i.test(s)) return { tr: 'Oyun durdu.', event: { kind: 'update' } };
  if (/^(?:the )?delay (?:is )?over(?:[,.]? (?:and )?(?:they|the teams|the players|both teams|the (?:game|match)|play) (?:are|is) (?:ready|set|about) to (?:continue|resume|restart))?$/i.test(s)) {
    return { tr: 'Oyun yeniden başladı.', event: { kind: 'update' } };
  }
  if (/^(?:the )?teams are (?:ready|set) to (?:continue|resume)$/i.test(s)) return { tr: 'Oyun yeniden başlıyor.', event: { kind: 'update' } };
  if (/^(?:the )?(?:match|game) (?:resumes|restarts|continues)$/i.test(s)) return { tr: 'Oyun yeniden başladı.', event: { kind: 'update' } };
  if (/^(?:the )?lineups are (?:announced|out|in)(?: and the players are warming up)?$/i.test(s)) return { tr: 'Kadrolar açıklandı.', event: { kind: 'update' } };
  if ((m = s.match(/^(?:the )?(?:match|game) (?:ends|is over|has ended|finishes) with a score of (\d+)\s*-\s*(\d+)$/i))) return { tr: `Maç ${scoreOf(m[1]!, m[2]!)} sona erdi.`, event: { kind: 'update' } };
  return null;
}

/** "T leads U 3-0", "T takes the lead 1-0 against U", "The score is now T 2, U 1", "It's 1-1 between T and U"… */
function scoreSentence(s: string, ctx: Ctx): Frag | null {
  let m: RegExpMatchArray | null;
  const t = (i: string) => ctx.names[Number(i)]!;
  const vs = (a: string, b: string | undefined, x: string, y: string) => (b ? `${t(a)} ${x}-${y} ${t(b)}` : `${t(a)} ${x}-${y}`);
  if ((m = s.match(new RegExp(`^${P} (?:takes?|took) the lead,? ${SCORE}(?: (?:against|over|vs\\.?) ${P})?$`, 'i'))) || (m = s.match(new RegExp(`^${P} (?:takes?|took) a ${SCORE} lead(?: (?:against|over) ${P})?$`, 'i')))) {
    return { tr: `${t(m[1]!)} öne geçti`, score: vs(m[1]!, m[4], m[2]!, m[3]!) };
  }
  if ((m = s.match(new RegExp(`^${P} (?:leads?|is leading|are leading|is ahead|are ahead|now leads?)(?: ${P})? ${SCORE}(?: (?:against|over|vs\\.?) ${P})?$`, 'i')))) {
    return { tr: '', score: vs(m[1]!, m[2] ?? m[5], m[3]!, m[4]!) };
  }
  if ((m = s.match(new RegExp(`^${P} (?:extends?|extended|doubles?|doubled|increases?|increased) (?:its|their|the) lead(?: to)? ${SCORE}(?: (?:against|over) ${P})?$`, 'i')))) {
    return { tr: `${t(m[1]!)} farkı açtı`, score: vs(m[1]!, m[4], m[2]!, m[3]!) };
  }
  if ((m = s.match(new RegExp(`^${P} (?:equalizes?|equalises?|equalized|levels?(?: the score)?|draws? level|pulls? level)(?: at| to)? ${SCORE}(?: (?:against|with) ${P})?$`, 'i')))) {
    return { tr: `${t(m[1]!)} beraberliği yakaladı`, score: vs(m[1]!, m[4], m[2]!, m[3]!) };
  }
  if ((m = s.match(new RegExp(`^${P} (?:reduces?|cuts?|pulls?|narrows?) (?:the deficit|one back|the gap)(?: to)? ${SCORE}(?: (?:against) ${P})?$`, 'i')))) {
    return { tr: `${t(m[1]!)} farkı azalttı`, score: vs(m[1]!, m[4], m[2]!, m[3]!) };
  }
  if ((m = s.match(new RegExp(`^(?:the score is now|it's now|it is now|it's|it is|now it's|the score now reads|the score is) ${SCORE}(?: between ${P} and ${P})?$`, 'i')))) {
    return { tr: '', score: m[3] ? `${t(m[3])} ${m[1]}-${m[2]} ${t(m[4]!)}` : scoreOf(m[1]!, m[2]!) };
  }
  if ((m = s.match(new RegExp(`^(?:the score is now |it's now |the score is )?${P},? (\\d+),? ${P},? (\\d+)$`, 'i')))) {
    return { tr: '', score: `${t(m[1]!)} ${m[2]}-${m[4]} ${t(m[3]!)}` };
  }
  if ((m = s.match(new RegExp(`^(?:the )?(?:match|game|score) is (?:now )?(?:level|tied) (?:at )?${SCORE}$`, 'i')))) return { tr: '', score: scoreOf(m[1]!, m[2]!) };
  if ((m = s.match(new RegExp(`^(?:the )?(?:match|game|score) is now ${SCORE} (?:against|with|vs\\.?) ${P}$`, 'i')))) return { tr: '', score: scoreOf(m[1]!, m[2]!) };
  return null;
}

/** Serbest vuruş, faul, el, korner, ofsayt, penaltı. */
function setPieceSentence(s: string, ctx: Ctx): Frag | null {
  let m: RegExpMatchArray | null;
  const team = (mm: RegExpMatchArray, a: number, b: number) => nm(ctx, mm[a] ?? mm[b]);

  // Serbest vuruş
  if ((m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:wins|is awarded|earns|gets|has won|won|draws) a free kick (.+)$`, 'i')))) {
    const where = whereOf(m[5]!.toLowerCase());
    if (!where) return null;
    const player = nm(ctx, m[1])!;
    const tm = team(m, 2, 3);
    return { tr: `${withTeam(player, tm)} ${WHERE_TR[where]} serbest vuruş kazandı.`, event: { kind: 'free_kick', player, team: tm, where } };
  }
  if ((m = s.match(new RegExp(`^(?:a )?free kick (?:for|to|awarded to) ${P}(?: (.+))?$`, 'i')))) {
    const where = m[2] ? whereOf(m[2].toLowerCase()) : undefined;
    if (where === null) return null;
    const tm = nm(ctx, m[1])!;
    return { tr: `${tm}${where ? ` ${WHERE_TR[where]}` : ''} serbest vuruş kazandı.`, event: { kind: 'free_kick', team: tm, ...(where ? { where } : {}) } };
  }

  // Faul / el
  if ((m = s.match(new RegExp(`^(?:a )?foul (?:committed )?by ${P}${TEAM}(?: (\\d+))?(?: on ${P}${TEAM})?$`, 'i')))) {
    const player = nm(ctx, m[1])!;
    const tm = team(m, 2, 3);
    const on = nm(ctx, m[5]);
    return { tr: `${withTeam(player, tm)} faul yaptı${on ? `; faule uğrayan: ${withTeam(on, team(m, 6, 7))}` : ''}.`, event: { kind: 'foul', player, team: tm, other: on } };
  }
  if ((m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:commits|committed|concedes) (?:a|another) foul(?: on ${P}${TEAM})?(?: for ${P})?$`, 'i')))) {
    const player = nm(ctx, m[1])!;
    const tm = team(m, 2, 3) ?? nm(ctx, m[8]);
    const on = nm(ctx, m[5]);
    return { tr: `${withTeam(player, tm)} faul yaptı${on ? `; faule uğrayan: ${withTeam(on, team(m, 6, 7))}` : ''}.`, event: { kind: 'foul', player, team: tm, other: on } };
  }
  if ((m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:is fouled|was fouled|gets fouled) by ${P}${TEAM}$`, 'i')))) {
    const by = nm(ctx, m[5])!;
    const on = nm(ctx, m[1])!;
    return { tr: `${withTeam(by, team(m, 6, 7))} faul yaptı; faule uğrayan: ${withTeam(on, team(m, 2, 3))}.`, event: { kind: 'foul', player: by, team: team(m, 6, 7), other: on } };
  }
  if ((m = s.match(new RegExp(`^(?:a )?hand ?ball (?:by|from) ${P}${TEAM}$`, 'i'))) || (m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:commits|is penalized for|is penalised for|concedes) (?:a )?hand ?ball$`, 'i')))) {
    const player = nm(ctx, m[1])!;
    const tm = team(m, 2, 3);
    return { tr: `${withTeam(player, tm)} elle oynadı.`, event: { kind: 'foul', player, team: tm } };
  }

  // Penaltı
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:concedes|gives away) a penalty(?: (?:after committing a|for a|with a) (foul|handball|hand ball)(?: in the (?:penalty area|box))?)?$`, 'i')))) {
    const player = nm(ctx, m[1])!;
    const tm = team(m, 2, 3);
    const hand = m[4] && /hand/i.test(m[4]);
    return { tr: `${withTeam(player, tm)} ceza sahasında ${hand ? 'elle oynadı' : 'faul yaptı'}: penaltı.`, event: { kind: 'penalty', player, team: tm } };
  }
  if ((m = s.match(new RegExp(`^(?:a )?penalty (?:is )?(?:awarded|given) (?:to|for) ${P}(?:,? as|\\. | after)? ?(?:${P} is fouled in the (?:penalty area|box))?$`, 'i'))) || (m = s.match(new RegExp(`^${P} (?:is awarded|are awarded|wins|win|earns|earn|gets|get) a penalty(?: after ${P} is fouled in the (?:penalty area|box))?$`, 'i')))) {
    const tm = nm(ctx, m[1])!;
    const on = nm(ctx, m[2]);
    return { tr: `${tm} penaltı kazandı${on ? `; ceza sahasında faule uğrayan: ${on}` : ''}.`, event: { kind: 'penalty', team: tm, player: on } };
  }
  if ((m = s.match(new RegExp(`^penalty (?:awarded|given) to ${P} is fouled in the (?:penalty area|box)$`, 'i')))) {
    return { tr: `Penaltı! ${nm(ctx, m[1])} ceza sahasında faule uğradı.`, event: { kind: 'penalty', player: nm(ctx, m[1]) } };
  }
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:is fouled|wins a penalty|draws a foul|earns a penalty) in the (?:penalty area|box)$`, 'i')))) {
    return { tr: `${withTeam(nm(ctx, m[1])!, team(m, 2, 3))} ceza sahasında faule uğradı.`, event: { kind: 'penalty', player: nm(ctx, m[1]), team: team(m, 2, 3) } };
  }

  if ((m = s.match(new RegExp(`^(?:the )?penalty (?:is )?saved by ${P}${TEAM}$`, 'i')))) {
    return { tr: `Penaltı kurtarıldı: kaleci ${withTeam(nm(ctx, m[1])!, team(m, 2, 3))}.`, event: { kind: 'penalty', other: nm(ctx, m[1]) } };
  }

  // Korner
  if ((m = s.match(new RegExp(`^${P} (?:wins|win|is awarded|are awarded|has been awarded|have been awarded|earns|earn|gets|get|won) a corner(?:,? (?:after|as) ${P} (?:concedes|conceded|concedes it|conceded it)(?: it)?|,? (?:conceded by|after a concession by|after a concession from) ${P})?$`, 'i')))) {
    const tm = nm(ctx, m[1])!;
    const by = nm(ctx, m[2] ?? m[3]);
    return { tr: `${tm} korner kazandı${by ? ` (kornere gönderen: ${by})` : ''}.`, event: { kind: 'corner', team: tm, other: by } };
  }
  if ((m = s.match(new RegExp(`^corner (?:awarded |kick )?(?:to|for) ${P}(?:,? (?:after|as) ${P} (?:concedes|conceded)(?: it)?|,? (?:conceded by|after a concession by|after a concession from) ${P})?$`, 'i')))) {
    const tm = nm(ctx, m[1])!;
    const by = nm(ctx, m[2] ?? m[3]);
    return { tr: `${tm} korner kazandı${by ? ` (kornere gönderen: ${by})` : ''}.`, event: { kind: 'corner', team: tm, other: by } };
  }
  if (/^corner(?: awarded)?!?$/i.test(s)) return { tr: 'Korner.', event: { kind: 'corner' } };
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:concedes|gives away|has conceded) a corner$`, 'i')))) {
    return { tr: `${withTeam(nm(ctx, m[1])!, team(m, 2, 3))} topu kornere gönderdi.`, event: { kind: 'corner', other: nm(ctx, m[1]) } };
  }

  // Ofsayt (cümle parçaları; satır düzeyinde birleştirilir)
  if (/^offside!?$/i.test(s)) return { tr: 'Ofsayt.', event: { kind: 'offside' } };
  if ((m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:is|was|gets) (?:caught|flagged|ruled|called) (?:offside|for offside|in an offside position)(?: for ${P})?$`, 'i')))) {
    return { tr: '', event: { kind: 'offside', player: nm(ctx, m[1]), team: team(m, 2, 3) ?? nm(ctx, m[5]) } };
  }
  if ((m = s.match(new RegExp(`^${P} (?:is|was) (?:the player )?(?:caught|flagged) (?:offside|in an offside position)$`, 'i'))) || (m = s.match(new RegExp(`^${P} is the player (?:caught|flagged) (?:offside|in an offside position)$`, 'i')))) {
    return { tr: '', event: { kind: 'offside', player: nm(ctx, m[1]) } };
  }
  if ((m = s.match(new RegExp(`^(?:offside (?:called |flagged |given )?(?:against|on|for) ${P}|${P} (?:is|are) (?:called|flagged|caught) (?:offside|for offside))(?:,? as ${P} (?:is|was) (?:caught|flagged) (?:offside|in an offside position))?$`, 'i')))) {
    return { tr: '', event: { kind: 'offside', team: nm(ctx, m[1] ?? m[2]), player: nm(ctx, m[3]) } };
  }
  return null;
}

/** Kartlar ve oyuncu değişiklikleri. */
function bookingSentence(s: string, ctx: Ctx): Frag | null {
  let m: RegExpMatchArray | null;
  const card = (c: string): 'yellow' | 'red' => (/red/i.test(c) ? 'red' : 'yellow');
  const cardTr = (c: 'yellow' | 'red', second?: boolean) => (second ? 'ikinci sarıdan kırmızı kart' : c === 'red' ? 'kırmızı kart' : 'sarı kart');
  const done = (playerIdx: string | undefined, teamIdx: string | undefined, c: 'yellow' | 'red', reasonEn: string | undefined, second = false): Frag | null => {
    const reason = cardReason(reasonEn);
    if (reason === null) return null;
    const player = nm(ctx, playerIdx);
    const tm = nm(ctx, teamIdx);
    const why = reason && reason !== 'ikinci sarı kart' ? ` (${reason})` : '';
    const sec = second || reason === 'ikinci sarı kart';
    const what = cardTr(sec ? 'red' : c, sec);
    const tr = player ? `${withTeam(player, tm)} ${what} gördü${why}.` : `${what[0]!.toUpperCase()}${what.slice(1)}${why}.`;
    return { tr, event: { kind: 'card', player, team: tm, card: sec ? 'red' : c } };
  };
  if ((m = s.match(new RegExp(`^${P}${TEAM}(?: (\\d+))? (?:receives|is shown|gets|earns|picks up|has received|received|is given|sees) (?:a|his|the) (yellow|red|second yellow) card(?: (?:for|after) (.+?))?$`, 'i')))) {
    return done(m[1], m[2] ?? m[3], card(m[5]!), m[6], /second/i.test(m[5]!));
  }
  if ((m = s.match(new RegExp(`^(yellow|red|second yellow) card (?:shown |issued |given )?(?:to|for) ${P}${TEAM}(?: (?:for|after) (.+?))?$`, 'i')))) {
    return done(m[2], m[3] ?? m[4], card(m[1]!), m[5], /second/i.test(m[1]!));
  }
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:is booked|has been booked|goes into the book)(?: (?:for|after) (.+?))?$`, 'i')))) return done(m[1], m[2] ?? m[3], 'yellow', m[4]);
  if ((m = s.match(new RegExp(`^${P}${TEAM} (?:is sent off|has been sent off|is dismissed)(?: (?:for|after) (.+?))?$`, 'i')))) return done(m[1], m[2] ?? m[3], 'red', m[4]);
  if ((m = s.match(/^(yellow|red) card(?: issued| shown)?!?$/i))) return done(undefined, undefined, card(m[1]!), undefined);

  // Değişiklik — [giren, çıkan]
  const sub = (on: string, off: string, teamIdx?: string): Frag => {
    const tm = nm(ctx, teamIdx);
    return { tr: `${tm ? `${tm}: ` : ''}Oyuna ${nm(ctx, on)} girdi, ${nm(ctx, off)} çıktı.`, event: { kind: 'substitution', player: nm(ctx, on), other: nm(ctx, off), team: tm } };
  };
  const SUBS: ReadonlyArray<[RegExp, number, number, number?]> = [
    [new RegExp(`^(?:substitution(?: for ${P})?:? )?${P} (?:comes|is coming|came) on for ${P}(?: (?:due to|because of) (?:an )?injury)?$`, 'i'), 2, 3, 1],
    [new RegExp(`^(?:substitution(?: for ${P})?:? )?${P} replaces ${P}$`, 'i'), 2, 3, 1],
    [new RegExp(`^(?:substitution(?: for ${P})?:? )?${P} (?:for|in for) ${P}$`, 'i'), 2, 3, 1],
    [new RegExp(`^${P} is on,? and ${P} is off$`, 'i'), 1, 2],
    [new RegExp(`^on (?:comes |for )?${P},? (?:and )?off (?:goes |comes )?${P}$`, 'i'), 1, 2],
    // Sportmonks olay verisiyle doğrulandı (19609927): "X is substituted for Y" = X girdi.
    [new RegExp(`^${P} is substituted (?:on )?for ${P}$`, 'i'), 1, 2],
    [new RegExp(`^${P} is (?:substituted off|replaced|taken off) (?:for|by) ${P}$`, 'i'), 2, 1],
    [new RegExp(`^${P} (?:goes|comes) off(?: injured)?,? (?:and|with) ${P} (?:comes on|replacing (?:him|her))$`, 'i'), 2, 1],
    [new RegExp(`^${P}${TEAM} makes a substitution(?:,|:)? (?:with )?${P} (?:replacing|coming on for|on for) ${P}$`, 'i'), 4, 5, 2],
  ];
  for (const [re, on, off, tm] of SUBS) {
    if ((m = s.match(re))) return sub(m[on]!, m[off]!, tm != null ? m[tm] : undefined);
  }
  return null;
}

/** VAR cümleleri. */
function varSentence(s: string, ctx: Ctx): Frag | null {
  let m: RegExpMatchArray | null;
  if ((m = s.match(new RegExp(`^var decision:? goal disallowed (?:for|due to) (offside|a foul|handball)(?: against ${P})?$`, 'i'))) || (m = s.match(new RegExp(`^var decision results in a disallowed goal for ${P} due to (offside|a foul|handball)$`, 'i')))) {
    const why = /offside/i.test(m[1]!) || /offside/i.test(m[2] ?? '') ? 'ofsayt' : /hand/i.test(m.slice(1).join(' ')) ? 'elle oynama' : 'faul';
    const who = nm(ctx, /^@?\d+$/.test(m[1]!) ? m[1] : m[2]);
    return { tr: `VAR kararı: gol ${why} nedeniyle iptal edildi${who ? ` (${who})` : ''}.`, event: { kind: 'var', player: who } };
  }
  if ((m = s.match(new RegExp(`^goal (?:overturned|disallowed|cancelled|ruled out) by var: ${P} scores(?: for ${P})?, but the goal is (?:disallowed|ruled out|overturned)(?: (?:after|following) (?:a )?var review)?$`, 'i')))) {
    return { tr: `VAR: ${withTeam(nm(ctx, m[1])!, nm(ctx, m[2]))} golü iptal edildi.`, event: { kind: 'var', player: nm(ctx, m[1]), team: nm(ctx, m[2]) } };
  }
  if ((m = s.match(new RegExp(`^var decision (?:results in|leads to|awards) a penalty (?:awarded )?(?:to|for) ${P}$`, 'i')))) {
    return { tr: `VAR kararı: ${nm(ctx, m[1])} lehine penaltı.`, event: { kind: 'var', team: nm(ctx, m[1]) } };
  }
  if (/^var decision:? (?:confirms )?no (?:goal|penalty)$/i.test(s)) return { tr: `VAR kararı: ${/penalty/i.test(s) ? 'penaltı yok' : 'gol yok'}.`, event: { kind: 'var' } };
  if (/^var decision:? (?:penalty|goal) (?:confirmed|stands)$/i.test(s)) return { tr: `VAR kararı: ${/penalty/i.test(s) ? 'penaltı' : 'gol'} geçerli.`, event: { kind: 'var' } };
  if ((m = s.match(new RegExp(`^the score remains(?: ${P})? (\\d+),?(?: ${P})? (\\d+)$`, 'i'))) || (m = s.match(new RegExp(`^the score remains ${SCORE}$`, 'i')))) {
    return { tr: '', score: m.length > 3 ? `${nm(ctx, m[1]) ?? ''} ${m[2]}-${m[4]} ${nm(ctx, m[3]) ?? ''}`.trim() : scoreOf(m[1]!, m[2]!) };
  }
  if (/^the goal is (?:awarded|confirmed|given|stands) after (?:a )?var review$/i.test(s)) return { tr: 'VAR incelemesi sonrası gol geçerli.', event: { kind: 'var' } };
  return null;
}

// ─── Şut / gol ──────────────────────────────────────────────────────────────────────────────────────────────────────

const ZONE_PHRASES: ReadonlyArray<[RegExp, ParsedZone]> = [
  [/\b(?:from |in )?(?:the )?left side of the six[- ]yard box\b/g, 'six_yard_left'],
  [/\b(?:from |in )?(?:the )?right side of the six[- ]yard box\b/g, 'six_yard_right'],
  [/\b(?:from |in )?(?:the )?(?:centre|center|middle)? ?(?:of )?(?:the )?six[- ]yard box\b/g, 'six_yard'],
  [/\b(?:from )?(?:very close range|point[- ]blank range|point[- ]blank)\b/g, 'six_yard'],
  [/\b(?:from )?close range\b|\b(?:a )?close[- ]range\b/g, 'close'],
  [/\b(?:from )?(?:the )?left side of the (?:box|penalty area|area)\b/g, 'box_left'],
  [/\b(?:from )?(?:the )?right side of the (?:box|penalty area|area)\b/g, 'box_right'],
  [/\b(?:from )?(?:the )?(?:centre|center|middle) of the (?:box|penalty area|area)\b/g, 'box_centre'],
  [/\b(?:from )?(?:a )?difficult angle (?:on|from) the left\b/g, 'angle_left'],
  [/\b(?:from )?(?:a )?difficult angle (?:on|from) the right\b/g, 'angle_right'],
  [/\b(?:from )?(?:a )?(?:tough|tight|narrow|acute) angle (?:on|from) the left\b/g, 'angle_left'],
  [/\b(?:from )?(?:a )?(?:tough|tight|narrow|acute) angle (?:on|from) the right\b/g, 'angle_right'],
  [/\b(?:from )?(?:a )?(?:difficult|tight|narrow|tough|acute) angle\b/g, 'angle_left'],
  [/\b(?:from )?(?:more than|over) \d+ (?:yards|metres|meters)(?: out)?\b|\b(?:from )?(?:long range|a long distance|distance)\b/g, 'long_range'],
  [/\b(?:from )?outside (?:of )?the (?:box|penalty area|area)\b/g, 'outside_box'],
  [/\b(?:from )?inside the (?:box|penalty area|area)\b|\bin the box\b/g, 'box_centre'],
];

const ZONE_TR: Record<ParsedZone, string> = {
  six_yard: 'altıpastan',
  six_yard_left: 'altıpasın solundan',
  six_yard_right: 'altıpasın sağından',
  close: 'yakın mesafeden',
  box_centre: 'ceza sahası içinden',
  box_left: 'ceza sahasının solundan',
  box_right: 'ceza sahasının sağından',
  outside_box: 'ceza sahası dışından',
  long_range: 'uzak mesafeden',
  angle_left: 'soldan dar açıdan',
  angle_right: 'sağdan dar açıdan',
};

/** Topun gittiği yer (köşe / kale ortası / dışarı yönü). */
const CORNER_OF_GOAL = /\b(?:into |in |to |at )?(?:the )?(top|bottom|high|low|lower|upper)[- ](left|right|centre|center)(?: corner)?(?: of the (?:goal|net))?\b|\b(?:into |in |to |at )?the (?:centre|center|middle) of the (?:goal|net)\b|\b(?:into |in )?the (?:high|low|top|bottom) (?:centre|center|middle) of the (?:goal|net)\b/g;

function cornerTr(m: string, outcome: ShotOutcome): string {
  const s = m.toLowerCase();
  const suffix = outcome === 'goal' ? 'e' : 'de';
  const vert = /top|high|upper/.test(s) ? 'üst' : /bottom|low/.test(s) ? 'alt' : '';
  const side = /left/.test(s) ? 'sol' : /right/.test(s) ? 'sağ' : '';
  if (!side) return outcome === 'goal' ? `kalenin ${vert ? `${vert} ` : ''}ortasına` : `kalenin ${vert ? `${vert} ` : ''}ortasında`;
  return `${side} ${vert ? `${vert} ` : ''}köşe${outcome === 'goal' ? 'ye' : suffix === 'de' ? 'de' : ''}`;
}

const MISS_DIR: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:just |slightly )?(?:goes |going |sails |flies |sent |sending it |it goes |but it goes )?(?:high and wide|over and wide|wide and high) (?:to|of) the left\b/g, 'üstten ve soldan auta çıktı'],
  [/\b(?:just |slightly )?(?:goes |going |sails |flies |sent |sending it |it goes |but it goes )?(?:high and wide|over and wide|wide and high) (?:to|of) the right\b/g, 'üstten ve sağdan auta çıktı'],
  [/\b(?:high and wide|over and wide)\b/g, 'üstten auta çıktı'],
  [/\b(?:just |slightly )?(?:wide|over|high|out|close) (?:to|of) the left\b|\b(?:misses|missing|miss|sending it|goes|going|but it goes|it goes)? ?(?:just )?(?:to )?the left\b/g, 'soldan auta çıktı'],
  [/\b(?:just |slightly )?(?:wide|over|high|out|close) (?:to|of) the right\b|\b(?:misses|missing|miss|sending it|goes|going|but it goes|it goes)? ?(?:just )?(?:to )?the right\b/g, 'sağdan auta çıktı'],
  [/\b(?:too high|over the (?:bar|crossbar|goal)|(?:goes|going|sails|flies|blazes|fires|it's|it is) (?:way |just )?(?:high|over)|high|over)\b/g, 'üstten auta çıktı'],
  [/\bwide\b/g, 'auta çıktı'],
];

const POST_TR: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:hits|hitting|strikes|striking|rattles|off|against) (?:the )?(?:left|near) post\b/g, 'sol direkten döndü'],
  [/\b(?:hits|hitting|strikes|striking|rattles|off|against) (?:the )?(?:right|far) post\b/g, 'sağ direkten döndü'],
  [/\b(?:hits|hitting|strikes|striking|rattles|off|against) (?:the )?(?:crossbar|bar)\b/g, 'üst direkten döndü'],
  [/\b(?:hits|hitting|strikes|striking|rattles|off|against) (?:the )?(?:post|woodwork|upright)\b/g, 'direkten döndü'],
];

const CONTEXT: ReadonlyArray<[RegExp, NonNullable<ParsedEvent['context']>, string]> = [
  [/,? ?\b(?:following|after|from|off) (?:a |the )?(?:corner(?: kick)?|corner situation)\b/g, 'corner', 'kornerden sonra'],
  [/,? ?\b(?:following|after|during|on|from|in) (?:a |the )?(?:fast break|quick break|counter[- ]attack|counterattack|break|counter)\b/g, 'fast_break', 'hızlı hücumda'],
  [/,? ?\b(?:from|following|after) (?:a |the )?(?:direct )?free kick\b/g, 'free_kick', 'serbest vuruştan'],
  [/,? ?\b(?:following|after|from|during) (?:a |the )?set[- ]piece(?: situation)?\b/g, 'set_piece', 'duran toptan'],
  [/,? ?\b(?:from the penalty spot|from the spot|from a penalty|penalty kick|from the penalty|with a penalty)\b/g, 'penalty', 'penaltıdan'],
];

const ASSIST_KIND: Record<string, string> = { cross: 'orta', 'through ball': 'ara pası', 'headed pass': 'kafa pası', pass: 'pas', 'long ball': 'uzun top', 'cut back': 'geri pas', cutback: 'geri pas' };
const AK = '(cross|through ball|headed pass|pass|long ball|cut back|cutback)';

/** Asist ifadeleri — yakalanan ad ve (varsa) asist türü. */
const ASSIST_RES: readonly RegExp[] = [
  new RegExp(`,? ?(?:and )?(?:he |she |the (?:attempt|shot|cross|header|effort|goal|strike) |this )?(?:was |is |had been )?assisted by ${P}(?:'s ${AK})?(?:,? who (?:delivered|provided|sent in|played) (?:a |the )?${AK})?(?: with (?:a |the )?${AK})?(?: for ${P})?`, 'gi'),
  new RegExp(`,? ?${P} (?:provided|delivered|supplied|gave|registers|registered|got) the (?:assist|cross|pass)(?: with (?:a |the )?${AK})?`, 'gi'),
  new RegExp(`,? ?(?:the )?(?:assist|cross|pass) (?:comes|came|was provided|is provided) (?:from|by) ${P}(?:'s ${AK})?`, 'gi'),
  new RegExp(`,? ?(?:with |after |from |following )(?:a |an )?${AK} (?:from|by) ${P}`, 'gi'),
  new RegExp(`,? ?(?:with |after |from |following )${P}'s ${AK}`, 'gi'),
];

/** Şut cümlesinde ad/ifade çıkarıldıktan sonra kalabilecek dolgu sözcükleri. Başka sözcük kalırsa satır çevrilmez. */
const GLUE = new Set(
  (
    "a an the his her its it it's is was has had have be been but and that which who then so as while with from of for by to in into on at " +
    'shot shots shoot shoots shooting takes took take taking attempts attempted attempt tries tried try trying effort strike strikes struck ' +
    'fires fired curls curled drives drove hits hit sends sent sending puts put places placed slots slotted ' +
    'footed foot left-footed right-footed right left header heads headed head ' +
    'misses missed miss missing goes going went go ends ending up out just slightly narrowly agonisingly agonizingly close well ' +
    'saved save saves blocked block blocks stopped denied keeps kept away ' +
    'scores scored score finds found back net results resulting in goal goals ' +
    'ball attempt! on target off another bit penalty heading shooting'
  ).split(' '),
);

type ShotInfo = {
  player?: string;
  team?: string;
  body?: 'left' | 'right' | 'head';
  zone?: ParsedZone;
  outcome?: ShotOutcome;
  place?: string;
  post?: string;
  context?: NonNullable<ParsedEvent['context']>;
  contextTr?: string;
  assist?: string;
  assistKind?: string;
  keeper?: string;
  blocker?: string;
  ownGoal?: boolean;
};

/**
 * Şut/gol cümlesi (maskeli). Döner: çözülen bilgi; tanınmayan sözcük kalırsa null. `hint` önceki işaret cümlesinden
 * ("Attempt missed.", "Goal!") gelen sonuç.
 */
function readShot(sentence: string, ctx: Ctx, hint?: ShotOutcome): ShotInfo | null {
  let s = ` ${sentence} `;
  const info: ShotInfo = {};
  const cut = (re: RegExp, fn?: (m: RegExpMatchArray) => void) => {
    s = s.replace(re, (...args) => {
      const m = args.slice(0, -2) as unknown as RegExpMatchArray;
      fn?.(m);
      return ' ';
    });
  };

  // Ham "Shot - X Head Shot Goal" biçimi ayrı (readRawShot).
  // Asist
  for (const re of ASSIST_RES) {
    cut(re, (m) => {
      const parts = m.slice(1).filter(Boolean) as string[];
      const who = parts.find((p) => /^\d+$/.test(p));
      const kind = parts.find((p) => !/^\d+$/.test(p));
      if (who != null) info.assist ??= ctx.names[Number(who)];
      if (kind) info.assistKind ??= ASSIST_KIND[kind.toLowerCase()];
    });
  }
  // Kaleci / engelleyen
  cut(new RegExp(`\\b(?:is |was |but it's |but it is |gets |)?saved(?: well| brilliantly)?(?: (?:in|into) (?:the )?[a-z -]*?(?:corner|goal))? by ${P}${TEAM}`, 'gi'), (m) => {
    info.keeper = ctx.names[Number(m[1])];
    info.outcome ??= 'saved';
  });
  cut(/\b(?:is |was |gets )?(?:blocked|cleared) off the (?:goal ?)?line\b/gi, () => {
    info.outcome ??= 'blocked';
    info.blocker ??= '';
  });
  cut(new RegExp(`\\bblocked by ${P}${TEAM}`, 'gi'), (m) => {
    info.blocker = ctx.names[Number(m[1])];
    info.outcome ??= 'blocked';
  });
  cut(new RegExp(`\\b(?:but )?(?:keeper |goalkeeper )?${P}${TEAM} (?:makes|made|pulls off) (?:a |the )?(?:good |great |fine |comfortable )?save|\\b(?:but )?(?:keeper |goalkeeper )?${P}${TEAM} saves it`, 'gi'), (m) => {
    m = [m[0], m[1] ?? m[4]] as unknown as RegExpMatchArray;
    info.keeper = ctx.names[Number(m[1])];
    info.outcome ??= 'saved';
  });

  // Kendi kalesine
  if (/\bown goal\b/i.test(s)) {
    info.ownGoal = true;
    info.outcome = 'goal';
    cut(/\b(?:scores |puts the ball into |results in )?(?:an |his |her )?own goal\b/gi);
  }

  // Penaltı golü ("converts the penalty")
  cut(/\b(?:converts|converted|scores|dispatches|slots home|tucks away) (?:the |a )?(?:penalty|spot[- ]kick)\b/gi, () => {
    info.outcome ??= 'goal';
    info.context ??= 'penalty';
    info.contextTr ??= 'penaltıdan';
  });

  // Bağlam
  for (const [re, ctxKey, tr] of CONTEXT) {
    cut(re, () => {
      info.context ??= ctxKey;
      info.contextTr ??= tr;
    });
  }

  // Bölge
  for (const [re, zone] of ZONE_PHRASES) {
    cut(new RegExp(re.source, 'gi'), () => {
      info.zone ??= zone;
    });
  }

  // Direk
  for (const [re, tr] of POST_TR) {
    cut(new RegExp(re.source, 'gi'), () => {
      info.post ??= tr;
    });
  }

  // Sonuç (köşe ifadesinden önce: "saved in the bottom left corner" ↔ "into the bottom left corner")
  const low = s.toLowerCase();
  const outcome: ShotOutcome | undefined =
    info.outcome ??
    (info.post
      ? 'post'
      : /\bscores?\b|\bscored\b|finds the (?:back of the )?net|results in a goal|into the (?:back of the )?net|\bnets\b|heads (?:the ball )?(?:home|in)|\bfinds the target and scores\b/.test(low)
        ? 'goal'
        : /\bsaved\b|\bsaves?\b/.test(low)
          ? 'saved'
          : /\bblocked\b/.test(low)
            ? 'blocked'
            : /\bmiss(?:es|ed|ing)?\b|\bwide\b|\bover\b|\bhigh\b|off target|\bthe (?:left|right)\b/.test(low)
              ? 'miss'
              : hint);
  if (!outcome) return null;
  info.outcome = outcome;

  cut(new RegExp(CORNER_OF_GOAL.source, 'gi'), (m) => {
    info.place ??= cornerTr(m[0]!, outcome);
  });
  if (outcome === 'miss') {
    for (const [re, tr] of MISS_DIR) {
      cut(new RegExp(re.source, 'gi'), () => {
        info.place ??= tr;
      });
    }
  }

  // Vuruş biçimi
  cut(/\b(?:a |his |her |the )?(left|right)[- ]footed\b|\bwith (?:his |her |the )?(left|right) foot\b|\b(left|right) foot\b/gi, (m) => {
    const side = (m[1] ?? m[2] ?? m[3])!.toLowerCase() as 'left' | 'right';
    info.body ??= side;
  });
  cut(/\bwith (?:another|other|a different) body part\b/gi);
  cut(/\b(?:a |his |her )?(?:header|headed|heads|head|headed attempt|headed effort)\b|\bwith (?:his |her )?head\b/gi, () => {
    info.body ??= 'head';
  });

  // Vuran + takım (ilk ad; "X from T", "X of T", "X for T", "X's", "for T")
  const shooter = s.match(new RegExp(`@(\\d+)(?:'s)?(?:\\s+(?:from|of)\\s+@(\\d+)|\\s*\\(@(\\d+)\\))?`));
  if (!shooter) return null;
  info.player = ctx.names[Number(shooter[1])];
  info.team = nm(ctx, shooter[2] ?? shooter[3]);
  s = s.replace(shooter[0]!, ' ');
  cut(new RegExp(`\\b(?:for|scores for|scoring for) ${P}`, 'gi'), (m) => {
    info.team ??= ctx.names[Number(m[1])];
  });

  // Kalan: dolgu sözcükleri dışında bir şey kalmamalı.
  const rest = s
    .toLowerCase()
    .replace(/[,;:!—–-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (rest.some((w) => !GLUE.has(w))) return null;
  return info;
}

const BODY_TR: Record<'left' | 'right' | 'head', string> = { left: 'sol ayakla', right: 'sağ ayakla', head: 'kafayla' };

function shotTr(info: ShotInfo, withScore?: string): string {
  const who = withTeam(info.player!, info.team);
  const how = [info.zone ? ZONE_TR[info.zone] : '', info.body ? BODY_TR[info.body] : ''].filter(Boolean).join(' ');
  const extras: string[] = [];
  if (info.assist) extras.push(`asist: ${info.assist}${info.assistKind ? ` – ${info.assistKind}` : ''}`);
  if (info.contextTr) extras.push(info.contextTr);
  const tail = extras.length ? ` (${extras.join(', ')})` : '';
  const o = info.outcome!;
  if (info.ownGoal) return `${who} kendi kalesine gol attı${withScore ? `, skor ${withScore}` : ''}.`;
  if (o === 'goal') return `${who} ${how ? `${how} ` : ''}${info.place ? `${info.place} ` : ''}golü attı${tail}.`;
  const verb = `${who} ${how ? `${how} ` : ''}vurdu`;
  let result: string;
  if (o === 'saved') result = info.keeper ? `kaleci ${info.keeper} ${info.place ? `${info.place} ` : ''}kurtardı` : `kaleci ${info.place ? `${info.place} ` : ''}kurtardı`;
  else if (o === 'blocked') result = info.blocker === '' ? 'top çizgiden çıkarıldı' : info.blocker ? `${info.blocker} engelledi` : 'savunmaya takıldı';
  else if (o === 'post') result = `top ${info.post ?? 'direkten döndü'}`;
  else result = info.place ? `top ${info.place}` : 'isabet yok';
  return `${verb}, ${result}${tail}.`;
}

/** "Shot - X Head Shot Goal" (Sportmonks ham satırı). */
const RAW_BODY: Record<string, 'left' | 'right' | 'head' | undefined> = { head: 'head', 'left foot': 'left', 'right foot': 'right', 'other body part': undefined };
function readRawShot(text: string): ParsedComment | null {
  const m = text.match(/^Shot - (.+?) (Head|Left Foot|Right Foot|Other Body Part) Shot (Goal|Own Goal|Saved|Blocked|Missed|Miss|Post|Hit Woodwork|Woodwork)$/i);
  if (!m || /[.!:]/.test(m[1]!)) return null;
  const player = m[1]!;
  const body = RAW_BODY[m[2]!.toLowerCase()];
  const r = m[3]!.toLowerCase();
  if (r === 'own goal') return { tr: `${player} kendi kalesine gol attı.`, event: { kind: 'shot', player, outcome: 'goal', ownGoal: true } };
  const outcome: ShotOutcome = r === 'goal' ? 'goal' : r === 'saved' ? 'saved' : r === 'blocked' ? 'blocked' : /post|wood/.test(r) ? 'post' : 'miss';
  return { tr: shotTr({ player, body, outcome }), event: { kind: 'shot', player, outcome, ...(body ? { body } : {}), ...(outcome === 'post' ? { post: true } : {}) } };
}

/** "An own goal by X makes it 2-0." / "Own goal by X puts the score at 0-1." / "Own goal by X for T." */
function ownGoal(s: string, ctx: Ctx): Frag | null {
  const m = s.match(new RegExp(`^(?:an )?own goal (?:by|from) ${P}${TEAM}(?:,? (?:makes it|making it|puts the score at|putting the score at|to make it|bringing the score to) ${SCORE})?$`, 'i'));
  if (!m) return null;
  const player = nm(ctx, m[1])!;
  const team = nm(ctx, m[2] ?? m[3]);
  return { tr: `Kendi kalesine gol: ${withTeam(player, team)}`, score: m[4] ? scoreOf(m[4], m[5]!) : undefined, event: { kind: 'goal', player, team, outcome: 'goal', ownGoal: true } };
}

/** Basit gol cümlesi: "X scores(, for T)?(, making it|to make it|bringing the score to) 2-1(, assisted by Y)". */
function simpleGoal(s: string, ctx: Ctx): Frag | null {
  const m = s.match(
    new RegExp(
      `^${P} scores(?: for ${P})?(?:,? (?:making it|to make it|make it|to make the score|bringing the (?:match|score|game) to|putting the score at|to bring the score to|and the score is now|and it's now) ${SCORE})?(?:,? (?:assisted by|with an assist from) ${P}(?:'s ${AK})?)?$`,
      'i',
    ),
  );
  if (!m) return null;
  const player = nm(ctx, m[1])!;
  const team = nm(ctx, m[2]);
  const assist = nm(ctx, m[5]);
  const kind = m[6] ? ASSIST_KIND[m[6].toLowerCase()] : undefined;
  return {
    tr: `${withTeam(player, team)} attı`,
    score: m[3] ? scoreOf(m[3], m[4]!) : undefined,
    assist: assist ? `${assist}${kind ? ` – ${kind}` : ''}` : undefined,
    event: { kind: 'goal', player, team, outcome: 'goal', assist },
  };
}

// ─── 3. Satır ───────────────────────────────────────────────────────────────────────────────────────────────────────

const MARKERS: ReadonlyArray<[RegExp, NonNullable<Frag['marker']>]> = [
  [/^goal!?$/i, 'goal'],
  [/^goal in the penalty shoot-?out!?$/i, 'shootout'],
  [/^(?:shot|shot on goal|shot on target|chance|big chance)!?$/i, 'shot'],
  [/^(?:attempt saved|saved|great save|what a save|save|penalty saved)!?$/i, 'saved'],
  [/^(?:penalty missed)!?$/i, 'missed'],
  [/^(?:attempt blocked|blocked)!?$/i, 'blocked'],
  [/^(?:attempt missed|missed|miss|so close|close)!?$/i, 'missed'],
];

const MARKER_OUTCOME: Partial<Record<NonNullable<Frag['marker']>, ShotOutcome>> = { goal: 'goal', shootout: 'goal', saved: 'saved', blocked: 'blocked', missed: 'miss' };

/** Cümlelere böl (maskeli metinde adlar nokta içermez). "Goal! The score…" → ["Goal!", "The score…"]. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z@"'])/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "The score is now 1-1 as X scores …" / "T leads 3-0 after X scores …" → iki parça. */
function clauses(s: string): string[] {
  const m = s.match(/^(.+?),? (?:as|after|when|with|thanks to|courtesy of) (@\d+(?:'s)? .+)$/);
  if (m && /\d+\s*-\s*\d+|@\d+ \d+/.test(m[1]!)) return [m[1]!, m[2]!];
  return [s];
}

function sentenceFrag(s: string, ctx: Ctx, hint?: ShotOutcome): Frag | null {
  const body = s.replace(/[.!]+$/, '').trim();
  for (const [re, marker] of MARKERS) if (re.test(body)) return { tr: '', marker };
  const f = infoSentence(body, ctx) ?? setPieceSentence(body, ctx) ?? bookingSentence(body, ctx) ?? varSentence(body, ctx) ?? scoreSentence(body, ctx) ?? ownGoal(body, ctx) ?? simpleGoal(body, ctx);
  if (f) return f;
  // Asist tek başına cümle ("He was assisted by X." / "X provided the assist." / "… who delivered a cross after a corner.")
  let ab = body;
  let actx: (typeof CONTEXT)[number] | undefined;
  for (const c of CONTEXT) {
    const next = ab.replace(new RegExp(c[0].source, 'gi'), '');
    if (next !== ab) {
      actx ??= c;
      ab = next.trim();
    }
  }
  for (const re of ASSIST_RES) {
    const one = new RegExp(`^${re.source.replace(/^,\? \?/, '')}$`, 'i');
    const m = ab.match(one);
    if (m) {
      const parts = m.slice(1).filter(Boolean) as string[];
      const who = parts.find((p) => /^\d+$/.test(p));
      const kind = parts.find((p) => !/^\d+$/.test(p));
      if (who != null) return { tr: '', assist: `${ctx.names[Number(who)]}${kind ? ` – ${ASSIST_KIND[kind.toLowerCase()]}` : ''}`, ...(actx ? { context: actx } : {}) } as Frag;
    }
  }
  if (/^(?:the )?(?:attempt|shot|effort) (?:was|is) (?:a )?(?:good|great|close|decent)(?: one)?$/i.test(body)) return { tr: '' };
  // Şut
  if (!/@\d+/.test(body)) return null;
  const info = readShot(body, ctx, hint);
  if (!info) return null;
  return {
    tr: '',
    event: {
      kind: info.outcome === 'goal' ? 'goal' : 'shot',
      player: info.player,
      team: info.team,
      outcome: info.outcome,
      body: info.body,
      zone: info.zone,
      ...(info.ownGoal ? { ownGoal: true } : {}),
      ...(info.outcome === 'post' ? { post: true } : {}),
      context: info.context,
      assist: info.assist,
    },
    ...{ shot: info },
  } as Frag & { shot: ShotInfo };
}

/** Çevrilmiş satırda İngilizce kalıntı var mı (adlar çıkarıldıktan sonra)? Son güvence: karışık dil çıkmasın. */
const EN_LEFTOVER = /\b(?:the|from|of|for|with|and|is|are|was|by|after|against|leads?|scores?|shot|goal|attempt|missed|blocked|saved|wins|awarded|free kick|corner|foul|offside|card|half|match|score|it|his|their)\b/i;
export function hasEnglishLeftover(tr: string, names: readonly string[]): boolean {
  let s = tr;
  for (const n of [...names].sort((a, b) => b.length - a.length)) s = s.split(n).join(' ');
  return EN_LEFTOVER.test(s);
}

/**
 * Bir anlatım satırını çöz: Türkçe metin + olay. Tanınmayan cümle varsa null (arayüz İngilizce gösterir).
 */
export function parseCommentLine(input: string): ParsedComment | null {
  const raw = readRawShot(input);
  if (raw) return raw;
  // Büyük harfli başlık ("GOAL OVERTURNED BY VAR: …") ad sanılmasın.
  const text = input.replace(/^([A-Z][A-Z' ]{3,}[A-Z])(?=[:!])/, (m) => m.toLowerCase().replace(/\bvar\b/, 'VAR'));
  const { text: masked, names } = maskNames(text);
  const ctx: Ctx = { names };
  const parts = sentences(masked.replace(/^Substitution for (@\d+)\. /i, 'Substitution for $1: ')).flatMap(clauses);
  if (parts.length === 0) return null;

  const frags: (Frag & { shot?: ShotInfo })[] = [];
  let hint: ShotOutcome | undefined;
  for (const p of parts) {
    const f = sentenceFrag(p, ctx, hint);
    if (!f) return null;
    if (f.marker) hint = MARKER_OUTCOME[f.marker] ?? hint;
    frags.push(f);
  }

  const markers = frags.filter((f) => f.marker).map((f) => f.marker!);
  const isGoalLine = markers.includes('goal') || markers.includes('shootout');
  const shootout = markers.includes('shootout');
  const score = frags.find((f) => f.score)?.score;
  const looseAssist = frags.find((f) => f.assist && !f.event)?.assist;
  const shots = frags.filter((f) => f.shot);
  const events = frags.filter((f) => f.event);

  // Ofsayt parçaları tek cümle
  if (events.length > 0 && events.every((f) => f.event!.kind === 'offside')) {
    const player = events.map((f) => f.event!.player).find(Boolean);
    const team = events.map((f) => f.event!.team).find(Boolean);
    const tr = player ? `Ofsayt: ${withTeam(player, team)}.` : team ? `Ofsayt: ${team}.` : 'Ofsayt.';
    return finish({ tr, event: { kind: 'offside', player, team } }, names);
  }

  // Şut / gol satırı
  if (shots.length === 1) {
    const info = shots[0]!.shot!;
    if (looseAssist && !info.assist) info.assist = looseAssist.replace(/ – (.+)$/, (_, k: string) => {
      info.assistKind ??= k;
      return '';
    });
    const looseCtx = frags.find((f) => f.context)?.context;
    if (looseCtx && !info.context) {
      info.context = looseCtx[1];
      info.contextTr = looseCtx[2];
    }
    const ev = shots[0]!.event!;
    if (isGoalLine && info.outcome !== 'goal') return null;
    const scoreFrag = frags.find((f) => f.score);
    const lead = scoreFrag?.tr ? `${scoreFrag.tr}: ${score}.` : score ? `Skor: ${score}.` : '';
    let tr = shotTr(info, info.ownGoal ? score : undefined);
    if (info.ownGoal) tr = `${isGoalLine ? 'GOL! ' : ''}${tr}${lead && !scoreFrag?.tr ? '' : lead ? ` ${lead}` : ''}`;
    else if (info.outcome === 'goal') tr = `${isGoalLine || score ? 'GOL! ' : ''}${tr}${lead ? ` ${lead}` : ''}`;
    else if (lead) return null;
    const others = frags.filter((f) => f !== shots[0] && !f.marker && !f.score && !(f.assist && !f.event) && f.tr === '' && !f.event);
    if (others.length) return null;
    if (frags.some((f) => f.event && f !== shots[0])) return null;
    // Ayrı "Goal!" satırı olmayan gol vuruşu ("X scores with a header.") vuruş sayılır — aynı gol listede iki kez "Gol" olmasın.
    const kind = ev.kind === 'goal' && !isGoalLine && !score ? 'shot' : ev.kind;
    return finish({ tr: tr.replace(/\s+/g, ' ').trim(), event: { ...ev, kind, assist: info.assist ?? ev.assist } }, names);
  }

  // Basit gol: "Goal! X scores, making it 1-0." (+ ayrı skor cümlesi / asist cümlesi)
  const goal = frags.find((f) => f.event?.kind === 'goal' && !f.shot);
  if (goal) {
    const assist = goal.assist ?? looseAssist;
    const prefix = shootout ? 'Penaltı atışları: ' : goal.event!.ownGoal && !isGoalLine ? '' : 'GOL! ';
    const tr = `${prefix}${goal.tr}${score ? `, skor ${score}` : ''}${assist ? ` (asist: ${assist})` : ''}.`;
    if (frags.some((f) => f.event && f !== goal)) return null;
    return finish({ tr, event: { ...goal.event!, ...(assist ? { assist: assist.replace(/ – .+$/, '') } : {}) } }, names);
  }

  // Yalnız skor cümlesi ("Goal! The score is now 2-2.", "Goal! T 2, U 1.")
  if (isGoalLine && score && events.length === 0) {
    const lead = frags.find((f) => f.score && f.tr)?.tr;
    return finish({ tr: `GOL! ${lead ? `${lead}, skor ${score}` : `Skor ${score}`}.`, event: { kind: 'goal', outcome: 'goal' } }, names);
  }

  // Diğer: olay cümleleri (+ VAR'da skor cümlesi)
  if (events.length >= 1 && !isGoalLine && markers.length === 0) {
    const texts = frags.map((f) => (f.score && !f.tr ? `Skor ${f.score}.` : f.tr)).filter(Boolean);
    if (texts.length !== frags.length) return null;
    return finish({ tr: texts.join(' '), event: events[0]!.event! }, names);
  }
  return null;
}

function finish(p: ParsedComment, names: readonly string[]): ParsedComment | null {
  if (!p.tr || hasEnglishLeftover(p.tr, names)) return null;
  return p;
}
