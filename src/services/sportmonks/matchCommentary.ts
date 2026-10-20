/**
 * Maç anlatımı (Sportmonks `comments` include'u) — sınıflandırma ve kural tabanlı Türkçe çeviri. Saf modül: sunucu ucu
 * (`/api/matches/[id]/commentary`) kullanır, istemci paketine girmez.
 *
 * Sportmonks satırında tür alanı YOK (yalnız `is_goal` / `is_important`); tür metinden çıkarılır. Metinler kalıplı ama aynı
 * olay birkaç farklı cümleyle yazılıyor ("takes a right-footed shot, but it's saved" / "Shot by X with his right foot is
 * saved" / "X's right-footed shot is saved"), bu yüzden çeviri "özne + vuruş biçimi + sonuç" diye bileşenli. Tanınmayan
 * cümle için `tr: null` → arayüz İngilizce metni gösterir. 2026-10-21, Süper Lig 3 maç / 202 satır ile kuruldu (testler).
 */
import { findGamblingTerms } from '@/utils/gamblingTerms';

export type CommentaryKind = 'goal' | 'card' | 'shot' | 'corner' | 'offside' | 'substitution' | 'var' | 'update' | 'other';

export type CommentaryItem = {
  id: number;
  order: number;
  minute: number | null;
  extraMinute: number | null;
  kind: CommentaryKind;
  important: boolean;
  /** Sportmonks metni (İngilizce, temizlenmiş). */
  en: string;
  /** Kural tabanlı Türkçe; kalıp tanınmadıysa null. */
  tr: string | null;
};

export type RawComment = {
  id?: number | null;
  comment?: string | null;
  minute?: number | null;
  extra_minute?: number | null;
  is_goal?: boolean | null;
  is_important?: boolean | null;
  order?: number | null;
};

/** Alan seçimli include — temel alanları (id, fixture_id) Sportmonks yine ekler. */
export const COMMENTARY_INCLUDE = 'comments:comment,minute,extra_minute,is_goal,is_important,order';
/** Maç durumu (önbellek süresi ve canlı yenileme kararı) için gereken fixture alanları. */
export const COMMENTARY_FIXTURE_SELECT = 'state_id,starting_at,starting_at_timestamp';

type Translation = { kind: CommentaryKind; tr: string };

const FOOT: Record<string, string> = { left: 'sol ayakla', right: 'sağ ayakla' };

/** Sportmonks'un ham "Shot - X Head Shot Goal" satırındaki vuruş biçimi. */
const RAW_BODY: Record<string, string> = { head: 'kafayla', 'left foot': 'sol ayakla', 'right foot': 'sağ ayakla', 'other body part': '' };

type ShotOutcome = 'goal' | 'saved' | 'blocked' | 'post' | 'miss';

const OUTCOME_TR: Record<Exclude<ShotOutcome, 'goal'>, string> = {
  saved: 'kaleci kurtardı',
  blocked: 'savunmaya takıldı',
  post: 'top direkten döndü',
  miss: 'isabet yok',
};

/** Vuruş cümlesinin kalan kısmından sonuç ("but it's saved", "but misses", "that hits the post", "and scores"). */
function shotOutcome(rest: string): ShotOutcome | null {
  const s = rest.toLowerCase();
  if (/own goal|\bscores\b|results in a goal|\bgoal\b/.test(s)) return 'goal';
  if (/\bsaved\b/.test(s)) return 'saved';
  if (/\bblocked\b/.test(s)) return 'blocked';
  if (/\b(post|crossbar|bar|woodwork)\b/.test(s)) return 'post';
  if (/\bmiss(es|ed)?\b|\bwide\b|\bover\b|off target/.test(s)) return 'miss';
  return null;
}

function shotTr(name: string, body: string, outcome: ShotOutcome): string {
  const how = body ? `${body} ` : '';
  return outcome === 'goal' ? `${name} ${how}golü attı.` : `${name} ${how}vurdu, ${OUTCOME_TR[outcome]}.`;
}

const N = '(.+?)';
const SCORE = '(\\d+\\s*-\\s*\\d+)';

/** Vuruş cümlesi kalıpları: [özne regex'i, vuruş biçimi çıkarıcı]. Sonuç cümlenin geri kalanından okunur. */
const SHOT_PATTERNS: ReadonlyArray<{ re: RegExp; body: (m: RegExpMatchArray) => string; outcome?: ShotOutcome }> = [
  { re: new RegExp(`^Shot - ${N} (Head|Left Foot|Right Foot|Other Body Part) Shot (.+)$`, 'i'), body: (m) => RAW_BODY[m[2]!.toLowerCase()] ?? '' },
  { re: new RegExp(`^${N} (?:takes|attempts) a (left|right)-footed shot\\b(.*)$`, 'i'), body: (m) => FOOT[m[2]!.toLowerCase()]! },
  { re: new RegExp(`^${N} scores with a (left|right)-footed shot\\b(.*)$`, 'i'), body: (m) => FOOT[m[2]!.toLowerCase()]!, outcome: 'goal' },
  { re: new RegExp(`^${N} takes a shot with his (left|right) foot\\b(.*)$`, 'i'), body: (m) => FOOT[m[2]!.toLowerCase()]! },
  { re: new RegExp(`^${N} takes a shot with his head\\b(.*)$`, 'i'), body: () => 'kafayla' },
  { re: new RegExp(`^${N} scores with a header\\b(.*)$`, 'i'), body: () => 'kafayla', outcome: 'goal' },
  { re: new RegExp(`^${N} (?:takes|attempts) a header(?: shot)?\\b(.*)$`, 'i'), body: () => 'kafayla' },
  { re: new RegExp(`^${N}'s? (left|right)-footed shot\\b(.*)$`, 'i'), body: (m) => FOOT[m[2]!.toLowerCase()]! },
  { re: new RegExp(`^${N}'s? header\\b(.*)$`, 'i'), body: () => 'kafayla' },
  { re: new RegExp(`^Shot by ${N} with his (left|right) foot\\b(.*)$`, 'i'), body: (m) => FOOT[m[2]!.toLowerCase()]! },
  { re: new RegExp(`^Shot by ${N} with (?:a header|his head)\\b(.*)$`, 'i'), body: () => 'kafayla' },
  { re: new RegExp(`^${N} takes a shot\\b(.*)$`, 'i'), body: () => '' },
];

/** Oyuncu değişikliği kalıpları → [giren, çıkan] grup sırası. */
const SUB_PATTERNS: ReadonlyArray<{ re: RegExp; on: number; off: number }> = [
  { re: new RegExp(`^(?:Substitution: )?${N} (?:comes|is coming) on for ${N}\\.$`, 'i'), on: 1, off: 2 },
  { re: new RegExp(`^${N} is on, and ${N} is off\\.$`, 'i'), on: 1, off: 2 },
  { re: new RegExp(`^On (?:comes |for )?${N}, off (?:goes )?${N}\\.$`, 'i'), on: 1, off: 2 },
  { re: new RegExp(`^${N} replaces ${N}\\.$`, 'i'), on: 1, off: 2 },
  { re: new RegExp(`^${N} is substituted off for ${N}\\.$`, 'i'), on: 2, off: 1 },
  { re: new RegExp(`^Substitution: ${N} (?:replaces|for) ${N}\\.$`, 'i'), on: 1, off: 2 },
];

const score = (s: string) => s.replace(/\s+/g, '');

/** Kalıp → çeviri (sıra önemli: özel kalıplar genel vuruş kalıplarından önce). */
function translateLine(text: string): Translation | null {
  let m: RegExpMatchArray | null;

  if ((m = text.match(/^Kick-off!(?: The referee is (.+?)\.)?$/i))) return { kind: 'update', tr: m[1] ? `Maç başladı! Hakem: ${m[1]}.` : 'Maç başladı!' };
  if ((m = text.match(new RegExp(`^(?:The )?(first|second) half ends with a score of ${SCORE}\\.$`, 'i')))) {
    return { kind: 'update', tr: `${m[1]!.toLowerCase() === 'first' ? 'İlk' : 'İkinci'} yarı ${score(m[2]!)} sona erdi.` };
  }
  if ((m = text.match(new RegExp(`^(?:The )?match ends with a score of ${SCORE}\\.$`, 'i')))) return { kind: 'update', tr: `Maç ${score(m[1]!)} sona erdi.` };
  if (/^Corner awarded\.$/i.test(text)) return { kind: 'corner', tr: 'Korner.' };
  if ((m = text.match(new RegExp(`^Corner awarded to ${N}\\.$`, 'i')))) return { kind: 'corner', tr: `${m[1]} korner kazandı.` };
  if (/^Offside\.$/i.test(text)) return { kind: 'offside', tr: 'Ofsayt.' };
  if ((m = text.match(new RegExp(`^VAR decision: Goal disallowed for offside against ${N}\\.$`, 'i')))) {
    return { kind: 'var', tr: `VAR kararı: gol ofsayt nedeniyle iptal edildi (${m[1]}).` };
  }

  // Goller
  if ((m = text.match(new RegExp(`^Goal! ${N} scores(?:,| to)? (?:making it|make it|bringing the (?:match|score) to) ${SCORE}(?:, assisted by ${N})?\\.$`, 'i')))) {
    return { kind: 'goal', tr: `GOL! ${m[1]} attı, skor ${score(m[2]!)}${m[3] ? ` (asist: ${m[3]})` : ''}.` };
  }
  if ((m = text.match(new RegExp(`^Goal! ${N} scores, assisted by ${N}\\. The score is now ${SCORE}\\.$`, 'i')))) {
    return { kind: 'goal', tr: `GOL! ${m[1]} attı, skor ${score(m[3]!)} (asist: ${m[2]}).` };
  }
  if ((m = text.match(new RegExp(`^Own goal by ${N} puts the score at ${SCORE}\\.$`, 'i')))) {
    return { kind: 'goal', tr: `Kendi kalesine gol: ${m[1]}, skor ${score(m[2]!)}.` };
  }

  // Kartlar
  if ((m = text.match(new RegExp(`^${N} receives a (yellow|red) card\\.$`, 'i')))) {
    return { kind: 'card', tr: `${m[1]} ${m[2]!.toLowerCase() === 'red' ? 'kırmızı' : 'sarı'} kart gördü.` };
  }
  if ((m = text.match(new RegExp(`^(Yellow|Red) card (?:shown|issued|given) to ${N}\\.$`, 'i')))) {
    return { kind: 'card', tr: `${m[2]} ${m[1]!.toLowerCase() === 'red' ? 'kırmızı' : 'sarı'} kart gördü.` };
  }
  if ((m = text.match(/^(Yellow|Red) card\.$/i))) return { kind: 'card', tr: m[1]!.toLowerCase() === 'red' ? 'Kırmızı kart.' : 'Sarı kart.' };

  for (const { re, on, off } of SUB_PATTERNS) {
    if ((m = text.match(re))) return { kind: 'substitution', tr: `Oyuna ${m[on]} girdi, ${m[off]} çıktı.` };
  }

  for (const { re, body, outcome: fixed } of SHOT_PATTERNS) {
    if ((m = text.match(re))) {
      const outcome = fixed ?? shotOutcome(m[m.length - 1] ?? '');
      if (!outcome) return null;
      const name = m[1]!;
      // Ham satır: "Shot - X Other Body Part Shot Own Goal"
      if (outcome === 'goal' && /own goal/i.test(m[m.length - 1] ?? '')) return { kind: 'shot', tr: `${name} kendi kalesine gol attı.` };
      return { kind: 'shot', tr: shotTr(name, body(m), outcome) };
    }
  }
  return null;
}

/** Çeviri tanımadığında tür: anahtar kelimelerden (arayüz filtresi ve ikon için). */
function guessKind(text: string, raw: RawComment): CommentaryKind {
  if (raw.is_goal) return 'goal';
  const s = text.toLowerCase();
  if (/\bvar\b/.test(s)) return 'var';
  if (/\b(yellow|red) card\b|sent off|\bbooked\b/.test(s)) return 'card';
  if (/substitut|comes on|replaces|\boff goes\b/.test(s)) return 'substitution';
  if (/\bcorner\b/.test(s)) return 'corner';
  if (/\boffside\b/.test(s)) return 'offside';
  if (/\bshot\b|\bheader\b|\bshoots?\b/.test(s)) return 'shot';
  if (raw.minute == null || /kick-off|half|match ends|full-time|full time/.test(s)) return 'update';
  return 'other';
}

/** Sportmonks metnindeki bozuk karakterler (gerçek veride "Own Goal球") ve fazla boşluk. */
export function cleanCommentText(text: string): string {
  return text
    .replace(/[⺀-鿿가-힯豈-﫿＀-￯]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function translateCommentary(raw: RawComment): Pick<CommentaryItem, 'kind' | 'tr'> & { en: string } {
  const en = cleanCommentText(raw.comment ?? '');
  const hit = translateLine(en);
  // `is_goal` satırı (ör. "Goal! …") gol sayılır; ham "Shot - … Goal" satırı vuruş olarak kalır.
  if (hit) return { en, tr: hit.tr, kind: raw.is_goal && hit.kind !== 'shot' ? 'goal' : hit.kind };
  return { en, tr: null, kind: guessKind(en, raw) };
}

/**
 * Ham satırlar → arayüz satırları: boş metin ve bahis dili içeren satır atılır (AdSense politikası; bkz.
 * utils/gamblingTerms.ts — Sportmonks anlatımında görülmedi, güvence), en yeni üstte (`order` azalan).
 */
export function normalizeCommentary(rows: readonly RawComment[] | null | undefined): CommentaryItem[] {
  const out: CommentaryItem[] = [];
  for (const raw of rows ?? []) {
    if (typeof raw?.id !== 'number') continue;
    const { en, tr, kind } = translateCommentary(raw);
    if (!en || findGamblingTerms(en).length > 0) continue;
    out.push({
      id: raw.id,
      order: typeof raw.order === 'number' ? raw.order : 0,
      minute: typeof raw.minute === 'number' ? raw.minute : null,
      extraMinute: typeof raw.extra_minute === 'number' && raw.extra_minute > 0 ? raw.extra_minute : null,
      kind,
      important: !!raw.is_important || !!raw.is_goal || kind === 'goal',
      en,
      tr,
    });
  }
  return out.sort((a, b) => b.order - a.order || b.id - a.id);
}
