/**
 * Asistan çıktı güvenliği:
 *  - Cümle kapısı: akış cümle cümle tamponlanır; bahis terimi (utils/gamblingTerms.ts) içeren cümle istemciye
 *    GÖNDERİLMEZ ve yanıt orada kesilir (`blocked`).
 *  - Link beyaz listesi: istemciye yalnız araçların ürettiği site içi yollar gider (model metni link yapılmaz).
 */
import { findGamblingTerms } from '@/utils/gamblingTerms';

export type SentenceGate = {
  /** Yeni parça ekler; gönderilebilir (tamamlanmış ve temiz) metni döner. Engellendiyse boş string. */
  push: (delta: string) => string;
  /** Akış bitti: kalan tamponu (temizse) döner. */
  flush: () => string;
  blocked: () => boolean;
};

const SENTENCE_END = /[.!?…]/;

export function createSentenceGate(): SentenceGate {
  let buffer = '';
  let blocked = false;
  const release = (text: string): string => {
    if (!text) return '';
    if (findGamblingTerms(text).length > 0) {
      blocked = true;
      buffer = '';
      return '';
    }
    return text;
  };
  return {
    push(delta) {
      if (blocked) return '';
      buffer += delta;
      // Son cümle sonuna kadar olan kısım kontrol edilip bırakılır; yarım cümle tamponda bekler.
      // Cümle sonu: noktalama + ardından boşluk (ondalık "2.5" bölünmesin) ya da satır sonu.
      let cut = -1;
      for (let i = buffer.length - 1; i >= 0; i--) {
        const ch = buffer[i]!;
        if (ch === '\n' || (SENTENCE_END.test(ch) && i + 1 < buffer.length && /\s/.test(buffer[i + 1]!))) {
          cut = i;
          break;
        }
      }
      if (cut === -1) return '';
      const ready = buffer.slice(0, cut + 1);
      buffer = buffer.slice(cut + 1);
      return release(ready);
    },
    flush() {
      if (blocked) return '';
      const rest = buffer;
      buffer = '';
      return release(rest);
    },
    blocked: () => blocked,
  };
}

export type AssistantLink = { label: string; href: string };

/** Kural Köşesi panelini açan özel hedef (istemci olay olarak işler). */
export const RULES_PANEL_HREF = '#kural-kosesi';

/** Yalnız site içi yol: tek `/` ile başlar, şema / protokol-göreli / ters eğik çizgi / boşluk yok. */
export function isAllowedLinkHref(href: unknown): href is string {
  if (typeof href !== 'string' || href.length > 300) return false;
  if (href === RULES_PANEL_HREF) return true;
  return /^\/(?![/\\])[^\s\\]*$/.test(href);
}

/** Geçersizleri atar, yinelenenleri birleştirir, en çok `max` link. */
export function sanitizeLinks(links: Array<{ label?: unknown; href?: unknown }>, max = 4): AssistantLink[] {
  const out: AssistantLink[] = [];
  const seen = new Set<string>();
  for (const l of links) {
    if (!isAllowedLinkHref(l.href) || typeof l.label !== 'string' || !l.label.trim() || seen.has(l.href)) continue;
    seen.add(l.href);
    out.push({ label: l.label.trim().slice(0, 80), href: l.href });
    if (out.length >= max) break;
  }
  return out;
}
