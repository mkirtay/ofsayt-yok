/**
 * Kota ölçümündeki rota adını sabitler. Sentry, SSR (`getServerSideProps`) sayfalarında işlem adına parametresiz URL'yi
 * yazıyor (`GET /matches/19713563-inter-parma`): sayaç her maç için ayrı alan açıyordu (72 saatte 3.596).
 * - `/matches/<slug>` → `/matches/[slug]` (sayfa ve `_next/data` isteği; `/api/matches/...` hariç)
 * - `/_next/data/<build-id>/…` → `/_next/data/(yıldız)/…` (derleme kimliği her deploy'da değişir)
 * - rakam içeren diğer segmentler → `:id` (köşeli parametreler `[slug]` dokunulmaz)
 */
export function normalizeRouteLabel(label: string): string {
  return label
    .replace(/\/_next\/data\/[^/\s]+\//g, '/_next/data/*/')
    .replace(/(^|[\s(]|\/_next\/data\/\*)\/matches\/[^/\s?)]+?(\.json)?(?=$|[/\s?)])/g, '$1/matches/[slug]$2')
    .replace(/\/(?!\[)[^/\s?)]*\d[^/\s?)]*/g, '/:id');
}
