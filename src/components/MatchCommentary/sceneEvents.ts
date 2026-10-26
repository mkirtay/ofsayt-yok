/**
 * Anlatım satırları → sahne olayları — saf modül. Sportmonks aynı golü çoğunlukla iki satırla yazar ("Goal! X scores to make
 * it 1-2, assisted by Y." + "X takes a shot with his left foot and scores."); satırlarda olay kimliği / ilişki alanı YOK
 * (comments include'u: comment, minute, extra_minute, is_goal, is_important, order). Bu yüzden eşleme temkinli: yalnız iki gol
 * satırı, aynı/komşu dakika, sıra olarak yakın, aynı taraf ve aynı oyuncu (biri adsızsa adlı olan), skorları çelişmiyorsa.
 * Aynı dakikadaki bağımsız şutlar birleşmez.
 *
 * Olay anahtarı grubun en küçük satır kimliğinden: canlı yenilemede aynı satırlar aynı anahtarı verir (sahne yeniden
 * başlamaz); `sig` sahne içeriği değişirse (sonradan düzeltme, VAR iptali) değişir.
 */
import type { CommentaryItem, CommentaryScene } from '@/services/sportmonks/matchCommentary';
import { normalizeSearchText } from '@/utils/searchText';

export type SceneEvent = {
  /** Kararlı anahtar: `e<en küçük satır kimliği>`. */
  key: string;
  /** Tohum: grubun en küçük satır kimliği (aynı olay her oynatılışta aynı yerleşim). */
  id: number;
  /** Temsilci satır (gol satırı varsa o) + birleşmiş sahne. */
  item: CommentaryItem & { scene: CommentaryScene };
  /** Gruptaki tüm satır kimlikleri. */
  ids: number[];
  /** Sonradan VAR ile iptal edilen / skoru geri alınan gol: kesin gol gibi gösterilmez. */
  disallowed: boolean;
  /** İçerik imzası — değişince sahne yeniden planlanır. */
  sig: string;
};

const tokens = (name: string | undefined) =>
  normalizeSearchText(name ?? '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);

/** İki ad aynı oyuncu mu: soyad (son token) ortak ve biri diğerinin tokenlarını kapsıyor. Adlardan biri yoksa belirsiz (null). */
export function sameActor(a: string | undefined, b: string | undefined): boolean | null {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return null;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.at(-1) === long.at(-1) || short.every((t) => long.includes(t));
}

/** Satırdaki son skor ("to make it 1-2", "The score is now 2-1"). */
export function scoreIn(text: string): [number, number] | null {
  const all = [...text.matchAll(/\b(\d{1,2})\s*-\s*(\d{1,2})\b/g)];
  const m = all.at(-1);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const minuteOf = (i: CommentaryItem) => (i.minute ?? 0) + (i.extraMinute ?? 0) / 100;

const DISALLOW = /disallow|ruled out|overturn|cancell?ed|chalked off/i;

function mergeScenes(rows: CommentaryItem[]): CommentaryScene {
  const scenes = rows.map((r) => r.scene!);
  // Bölgesi metinden gelen satır esas; yoksa vuruş satırı (vuruş biçimi orada), o da yoksa ilk satır.
  const base = scenes.find((s) => s.zoneFromText) ?? rows.find((r) => r.kind === 'shot')?.scene ?? scenes[0]!;
  const merged: CommentaryScene = { ...base, actors: base.actors.length ? base.actors : (scenes.find((s) => s.actors.length)?.actors ?? []) };
  merged.side = scenes.find((s) => s.side)?.side ?? null;
  if (scenes.some((s) => s.header)) merged.header = true;
  if (scenes.some((s) => s.ownGoal)) merged.ownGoal = true;
  const assist = scenes.find((s) => s.assist)?.assist;
  if (assist) merged.assist = assist;
  return merged;
}

/**
 * Satırlar (herhangi bir sırada) → sahne olayları, en yeni üstte; `byItemId` her sahneli satırı olayına bağlar.
 */
export function buildSceneEvents(items: readonly CommentaryItem[]): { events: SceneEvent[]; byItemId: Map<number, SceneEvent> } {
  const chrono = [...items].sort((a, b) => a.order - b.order || a.id - b.id);
  const withScene = chrono.filter((i) => i.scene);
  const groupOf = new Map<number, CommentaryItem[]>();

  // 1) Gol çiftleri: her gol satırı en fazla bir eşle.
  const goals = withScene.filter((i) => i.scene!.type === 'goal');
  for (let a = 0; a < goals.length; a++) {
    const g = goals[a]!;
    if (groupOf.has(g.id)) continue;
    let best: CommentaryItem | null = null;
    for (let b = a + 1; b < goals.length; b++) {
      const h = goals[b]!;
      if (groupOf.has(h.id)) continue;
      if (Math.abs(minuteOf(h) - minuteOf(g)) > 1) break;
      if (Math.abs(h.order - g.order) > 3) continue;
      const sa = g.scene!;
      const sb = h.scene!;
      if (sa.side && sb.side && sa.side !== sb.side) continue;
      if (!!sa.ownGoal !== !!sb.ownGoal && sa.actors.length && sb.actors.length) continue;
      if (sameActor(sa.actors[0], sb.actors[0]) === false) continue;
      const ka = scoreIn(g.en);
      const kb = scoreIn(h.en);
      if (ka && kb && (ka[0] !== kb[0] || ka[1] !== kb[1])) continue;
      best = h;
      break;
    }
    const group = best ? [g, best] : [g];
    for (const r of group) groupOf.set(r.id, group);
  }

  // 2) İptal: golden sonra 6 dk içinde VAR iptal satırı (oyuncu/takım çelişmiyorsa) ya da 10 dk içinde daha düşük toplam skor.
  const disallowedIds = new Set<number>();
  for (const g of goals) {
    const group = groupOf.get(g.id)!;
    if (group[0] !== g) continue;
    const last = group.reduce((m, r) => (r.order > m.order ? r : m), g);
    const score = group.map((r) => scoreIn(r.en)).find(Boolean) ?? null;
    for (const r of chrono) {
      if (r.order <= last.order) continue;
      const dm = minuteOf(r) - minuteOf(g);
      if (r.minute != null && dm > 10) break;
      if (r.kind === 'var' && DISALLOW.test(r.en) && (r.minute == null || dm <= 6)) {
        const who = r.en.match(/(?:for|against|by)\s+([\p{Lu}][\p{L}' -]+?)(?:\s+(?:due|for|after|scores|has)|[,.]|$)/u)?.[1];
        if (sameActor(who, g.scene!.actors[0]) !== false || !who) {
          disallowedIds.add(g.id);
          break;
        }
      }
      // Bir sonraki gol satırı skor bildiriyorsa yalnız ona bakılır; daha düşük toplam = bu gol sayılmadı.
      const sc = r.kind === 'goal' || r.kind === 'update' ? scoreIn(r.en) : null;
      if (score && sc && sc[0] + sc[1] < score[0] + score[1]) {
        disallowedIds.add(g.id);
        break;
      }
      if (score && sc && r.kind === 'goal') break;
    }
  }

  const byItemId = new Map<number, SceneEvent>();
  const events: SceneEvent[] = [];
  for (const row of withScene) {
    if (byItemId.has(row.id)) continue;
    const group = groupOf.get(row.id) ?? [row];
    const ids = group.map((r) => r.id).sort((a, b) => a - b);
    const rep = group.find((r) => r.kind === 'goal') ?? group[0]!;
    const scene = group.length > 1 ? mergeScenes(group) : row.scene!;
    const disallowed = group.some((r) => disallowedIds.has(r.id));
    const ev: SceneEvent = {
      key: `e${ids[0]}`,
      id: ids[0]!,
      item: { ...rep, scene },
      ids,
      disallowed,
      sig: JSON.stringify([scene, disallowed, rep.minute, rep.extraMinute]),
    };
    for (const r of group) byItemId.set(r.id, ev);
    events.push(ev);
  }
  // En yeni üstte: grubun en büyük sırası.
  const orderById = new Map(chrono.map((r) => [r.id, r.order]));
  const orderOf = (e: SceneEvent) => Math.max(...e.ids.map((id) => orderById.get(id) ?? 0));
  events.sort((a, b) => orderOf(b) - orderOf(a) || b.id - a.id);
  return { events, byItemId };
}

export type SceneRun = { event: SceneEvent; n: number };

/**
 * Gelen olay → oynatma kararı (sahne bileşeni kullanır). `replay`: kullanıcı satıra tıkladı → hemen baştan. Aynı anahtar +
 * aynı imza (canlı yenilemede tekrar gelen olay) → değişiklik yok; imza değiştiyse (düzeltme/iptal) yeniden planlanır.
 * Canlı takipte (`follow`) sahne oynarken yeni olay bekletilir (`pending`, yalnız en yenisi; kuyruk yok).
 */
export function nextRun(
  cur: SceneRun,
  event: SceneEvent,
  { replay, follow, busy }: { replay: boolean; follow: boolean; busy: boolean },
): { run: SceneRun; pending: SceneEvent | null } {
  if (replay) return { run: { event, n: cur.n + 1 }, pending: null };
  if (event.key === cur.event.key) return { run: event.sig === cur.event.sig ? cur : { event, n: cur.n + 1 }, pending: null };
  if (follow && busy) return { run: cur, pending: event };
  return { run: { event, n: cur.n + 1 }, pending: null };
}
