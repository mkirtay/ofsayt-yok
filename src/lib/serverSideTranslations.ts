// Translations are now bundled client-side; this is a no-op kept for API compatibility.
export async function serverSideTranslations(
  _locale: string,
  _ns: string[],
): Promise<Record<string, never>> {
  return {};
}
