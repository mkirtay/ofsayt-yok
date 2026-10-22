/**
 * Maç anlatımı (Sportmonks `comments` include'u) — sınıflandırma ve kural tabanlı Türkçe çeviri. Saf modül: sunucu ucu
 * (`/api/matches/[id]/commentary`) kullanır, istemci paketine girmez.
 *
 * Sportmonks satırında tür alanı YOK (yalnız `is_goal` / `is_important`); tür metinden çıkarılır. Metinler kalıplı ama aynı
 * olay birkaç farklı cümleyle yazılıyor ("takes a right-footed shot, but it's saved" / "Shot by X with his right foot is
 * saved" / "X's right-footed shot is saved"), bu yüzden çeviri "özne + vuruş biçimi + sonuç" diye bileşenli. Tanınmayan
 * cümle için `tr: null` → arayüz İngilizce metni gösterir. 2026-10-21 Süper Lig 3 maç ile kuruldu; 2026-10-22 bileşenli çözümleyiciye
 * (commentaryParse.ts) geçti: 4 gün / 20+ lig / 6075 satırda kapsam %49 → %97.
 */
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { parseCommentLine, type ParsedEvent, type ParsedKind, type ParsedZone, type ShotOutcome } from './commentaryParse';

export type CommentaryKind =
  | 'goal'
  | 'card'
  | 'shot'
  | 'corner'
  | 'offside'
  | 'substitution'
  | 'var'
  | 'update'
  | 'foul'
  | 'free_kick'
  | 'penalty'
  | 'other';

export type CommentaryItem = {
  id: number;
  order: number;
  minute: number | null;
  extraMinute: number | null;
  kind: CommentaryKind;
  important: boolean;
  /** Sportmonks metni (İngilizce, temizlenmiş). */
  en: string;
  /** Kural tabanlı Türkçe (commentaryParse.ts); satır tam çözülemediyse null — yarım çeviri yok. */
  tr: string | null;
  /** Temsili 2D canlandırma için sahne; olay sahneye dönüşmüyorsa (başlama, ofsayt, devre sonu…) null. */
  scene: CommentaryScene | null;
};

export type SceneType =
  | 'shot_saved'
  | 'shot_blocked'
  | 'shot_off'
  | 'goal'
  | 'corner'
  | 'card_yellow'
  | 'card_red'
  | 'substitution'
  | 'foul'
  | 'free_kick'
  | 'offside';

/** Vuruşun kabaca bölgesi — sol/sağ HÜCUM EDEN oyuncunun bakışına göre (kaleye dönük). */
export type SceneZone =
  | 'six_yard'
  | 'box_centre'
  | 'box_left'
  | 'box_right'
  | 'outside_box_centre'
  | 'outside_box_left'
  | 'outside_box_right';

export type SceneSide = 'home' | 'away';

export type CommentaryScene = {
  type: SceneType;
  /** Olayı yapan takım (vuruşta / kornerde hücum eden, kartta kartı gören, değişiklikte değişiklik yapan). Bilinmiyorsa null. */
  side: SceneSide | null;
  /** Metindeki oyuncu adları: vuruşta [vuran], kartta [kart gören], değişiklikte [giren, çıkan], faulde [faul yapan, ?maruz kalan]. */
  actors: string[];
  /** Vuruş bölgesi (şut/gol; kornerde hedef bölge). Metinde yoksa olay kimliğinden belirlenimli temsili seçim (`zoneFromText` false). */
  zone: SceneZone | null;
  zoneFromText: boolean;
  header: boolean;
  /** Direkten dönen vuruş (shot_off). */
  post?: boolean;
  /** Kendi kalesine gol: aktör savunan takımdan; `side` golü kazanan (hücum eden) takım. */
  ownGoal?: boolean;
  /** Metinde geçen takım adı (oyuncu kadroda bulunamazsa taraf buradan çözülür). */
  team?: string;
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

const ZONE: Record<ParsedZone, SceneZone> = {
  six_yard: 'six_yard',
  six_yard_left: 'six_yard',
  six_yard_right: 'six_yard',
  close: 'six_yard',
  box_centre: 'box_centre',
  box_left: 'box_left',
  box_right: 'box_right',
  outside_box: 'outside_box_centre',
  long_range: 'outside_box_centre',
  angle_left: 'box_left',
  angle_right: 'box_right',
};

/**
 * Metinde bölge yoksa temsili bölge — olay kimliğinden belirlenimli (her yüklemede aynı sahne). Kafa vuruşu ceza sahası
 * içinden; savunmaya takılan şut çoğunlukla ceza sahası dışından; gol çoğunlukla ceza sahası içinden.
 */
function defaultZone(id: number, outcome: ShotOutcome, header: boolean): SceneZone {
  const pick = <T,>(xs: readonly T[]) => xs[Math.abs(id) % xs.length]!;
  if (header) return pick(['six_yard', 'box_centre', 'box_centre'] as const);
  if (outcome === 'goal') return pick(['box_centre', 'box_left', 'box_right', 'six_yard', 'outside_box_centre'] as const);
  if (outcome === 'blocked') return pick(['outside_box_centre', 'outside_box_left', 'outside_box_right', 'box_centre'] as const);
  if (outcome === 'saved') return pick(['box_centre', 'box_left', 'box_right', 'outside_box_centre'] as const);
  return pick(['box_left', 'box_right', 'outside_box_centre', 'outside_box_left', 'outside_box_right'] as const);
}

const SHOT_SCENE: Record<ShotOutcome, SceneType> = { goal: 'goal', saved: 'shot_saved', blocked: 'shot_blocked', post: 'shot_off', miss: 'shot_off' };

/** Çözülmüş olay → sahne (taraf hariç: `side` kadroyla sonradan çözülür, bkz. commentaryScene.ts). */
export function sceneFromEvent(ev: ParsedEvent, id = 0): CommentaryScene | null {
  const base = { side: null, zone: null, zoneFromText: false, header: false, ...(ev.team ? { team: ev.team } : {}) } as const;
  switch (ev.kind) {
    case 'corner':
      return { ...base, type: 'corner', actors: [] };
    case 'card':
      return { ...base, type: ev.card === 'red' ? 'card_red' : 'card_yellow', actors: ev.player ? [ev.player] : [] };
    case 'substitution':
      return ev.player && ev.other ? { ...base, type: 'substitution', actors: [ev.player, ev.other] } : null;
    case 'foul':
      return ev.player ? { ...base, type: 'foul', actors: [ev.player, ...(ev.other ? [ev.other] : [])] } : null;
    // Serbest vuruş: aktör faule uğrayan, `side` onun takımı (akış o takımın hücumu).
    case 'free_kick':
      return ev.player ? { ...base, type: 'free_kick', actors: [ev.player] } : null;
    case 'offside':
      return ev.player || ev.team ? { ...base, type: 'offside', actors: ev.player ? [ev.player] : [] } : null;
    case 'goal':
    case 'shot': {
      if (!ev.outcome || !ev.player) return null;
      if (ev.ownGoal) return { ...base, team: undefined, type: 'goal', actors: [ev.player], zone: 'six_yard', ownGoal: true };
      const header = ev.body === 'head';
      const tz = ev.zone ? ZONE[ev.zone] : null;
      return {
        ...base,
        type: SHOT_SCENE[ev.outcome],
        actors: [ev.player],
        zone: tz ?? defaultZone(id, ev.outcome, header),
        zoneFromText: !!tz,
        header,
        ...(ev.outcome === 'post' ? { post: true } : {}),
      };
    }
    default:
      return null;
  }
}

/**
 * Satır → sahne. Sahne türleri: şut (kurtarıldı / bloke / dışarı-direk), gol, korner, sarı/kırmızı kart, oyuncu değişikliği,
 * faul. Satır çözülemezse (bkz. commentaryParse.ts) sahne yok.
 */
export function classifyScene(text: string, id = 0): CommentaryScene | null {
  const parsed = parseCommentLine(text);
  return parsed ? sceneFromEvent(parsed.event, id) : null;
}

const KIND: Record<ParsedKind, CommentaryKind> = {
  goal: 'goal',
  card: 'card',
  shot: 'shot',
  corner: 'corner',
  offside: 'offside',
  substitution: 'substitution',
  var: 'var',
  update: 'update',
  foul: 'foul',
  free_kick: 'free_kick',
  penalty: 'penalty',
  other: 'other',
};

/** Çeviri tanımadığında tür: anahtar kelimelerden (arayüz filtresi ve ikon için). */
function guessKind(text: string, raw: RawComment): CommentaryKind {
  if (raw.is_goal) return 'goal';
  const s = text.toLowerCase();
  if (/\bvar\b/.test(s)) return 'var';
  if (/\b(yellow|red) card\b|sent off|\bbooked\b/.test(s)) return 'card';
  if (/substitut|comes on|replaces|\boff goes\b/.test(s)) return 'substitution';
  if (/\bcorner\b/.test(s)) return 'corner';
  if (/\bpenalty\b/.test(s)) return 'penalty';
  if (/\bfree kick\b/.test(s)) return 'free_kick';
  if (/\bfoul\b|\bhandball\b/.test(s)) return 'foul';
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

export function translateCommentary(raw: RawComment): Pick<CommentaryItem, 'kind' | 'tr'> & { en: string; event: ParsedEvent | null } {
  const en = cleanCommentText(raw.comment ?? '');
  const hit = parseCommentLine(en);
  // `is_goal` satırı (ör. "Goal! …") gol sayılır; aynı golün ayrı vuruş satırı ("X scores with a header.") vuruş olarak kalır.
  if (hit) return { en, tr: hit.tr, kind: raw.is_goal && hit.event.kind !== 'shot' ? 'goal' : KIND[hit.event.kind], event: hit.event };
  return { en, tr: null, kind: guessKind(en, raw), event: null };
}

/**
 * Ham satırlar → arayüz satırları: boş metin ve bahis dili içeren satır atılır (AdSense politikası; bkz.
 * utils/gamblingTerms.ts — Sportmonks anlatımında görülmedi, güvence), en yeni üstte (`order` azalan).
 */
export function normalizeCommentary(rows: readonly RawComment[] | null | undefined): CommentaryItem[] {
  const out: CommentaryItem[] = [];
  for (const raw of rows ?? []) {
    if (typeof raw?.id !== 'number') continue;
    const { en, tr, kind, event } = translateCommentary(raw);
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
      scene: event ? sceneFromEvent(event, raw.id) : null,
    });
  }
  return out.sort((a, b) => b.order - a.order || b.id - a.id);
}
