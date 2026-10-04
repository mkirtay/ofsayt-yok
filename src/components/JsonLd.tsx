interface JsonLdProps {
  schema: Record<string, unknown>;
}

/**
 * `<script>` içine güvenli JSON: `<` (`</script>` kaçışı), U+2028/2029 kaçışlanır — dış kaynaktan gelen başlık / isim
 * (haber, Sportmonks) betiği kapatıp HTML enjekte edemesin. JSON olarak anlamı değişmez.
 */
export function serializeJsonLd(schema: Record<string, unknown>): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export default function JsonLd({ schema }: JsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />;
}
