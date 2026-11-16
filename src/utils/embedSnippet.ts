/** Gömülebilir puan durumu (bkz. pages/embed/puan-durumu) — lig sayfasında gösterilen iframe kodu. */
export function standingsEmbedSnippet(baseUrl: string, slug: string, leagueName: string): string {
  return `<iframe src="${baseUrl}/embed/puan-durumu/${slug}" title="${leagueName} puan durumu" width="100%" height="640" style="border:0;max-width:480px" loading="lazy"></iframe>`;
}
