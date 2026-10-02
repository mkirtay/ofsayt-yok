/**
 * Puan durumunda grup başlığı: Sportmonks "Group A" → "Grup A"; MLS konferansları çevrilir; diğer adlar aynen
 * (ör. eski sağlayıcının "A" → "Grup A").
 */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

const CONFERENCE_KEYS: Record<string, string> = {
  'western conference': 'standings.conferenceWest',
  'eastern conference': 'standings.conferenceEast',
};

export function standingsGroupHeading(name: string, t: Translate): string {
  const trimmed = name.trim();
  const conference = CONFERENCE_KEYS[trimmed.toLowerCase()];
  if (conference) return t(conference);
  const group = /^group\s+(.+)$/i.exec(trimmed);
  if (group) return t('standings.groupHeading', { name: group[1] });
  // Tek harf / kısa kod (eski sağlayıcı, Dünya Kupası "A") → "Grup A"; uzun adlar olduğu gibi.
  return trimmed.length <= 3 ? t('standings.groupHeading', { name: trimmed }) : trimmed;
}
