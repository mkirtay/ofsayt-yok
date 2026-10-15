/**
 * @etiket ayrıştırma — sunucu (lib/gundem/mentions.ts, doğrulama) ve istemci (PostCard / yorum gösterimi, öneri kutusu)
 * AYNI kuralı kullanır. Kullanıcı adı kuralı lib/validation.ts → usernameRules ile aynı: 3–30 harf / rakam / alt çizgi.
 * E-posta içindeki @ (önünde harf / rakam / nokta) etiket sayılmaz.
 */
export const MENTION_RE = /(^|[^\p{L}\p{N}_@.])@([A-Za-z0-9_]{3,30})(?![A-Za-z0-9_])/gu;

/** Metindeki etiketler (küçük harf, tekilleştirilmiş, metin sırasıyla). */
export function extractMentionHandles(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(MENTION_RE)) {
    const h = m[2]!.toLowerCase();
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

export type MentionPart = { text: string } | { handle: string; userId: string };

/**
 * Gövdeyi düz metin + doğrulanmış etiket parçalarına böler. Yalnız sunucunun `mentions` listesindekiler bağlantı olur;
 * diğer @ifadeler (var olmayan / engelli / silinmiş / 5'i aşan) düz metin kalır.
 */
export function splitMentions(body: string, mentions: readonly { username: string; userId: string }[] | undefined): MentionPart[] {
  if (!mentions?.length) return [{ text: body }];
  const byHandle = new Map(mentions.map((m) => [m.username.toLowerCase(), m.userId]));
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const userId = byHandle.get(m[2]!.toLowerCase());
    if (!userId) continue;
    const at = m.index! + m[1]!.length;
    if (at > last) parts.push({ text: body.slice(last, at) });
    parts.push({ handle: m[2]!, userId });
    last = at + 1 + m[2]!.length;
  }
  if (last < body.length) parts.push({ text: body.slice(last) });
  return parts;
}

/** Öneri kutusu: imlecin hemen önündeki yarım etiket (`@ab|`) → { query, start }; yoksa null. */
export function activeMentionQuery(value: string, caret: number): { query: string; start: number } | null {
  const m = /(^|[^\p{L}\p{N}_@.])@([A-Za-z0-9_]{1,30})$/u.exec(value.slice(0, caret));
  if (!m) return null;
  return { query: m[2]!, start: caret - m[2]!.length - 1 };
}
