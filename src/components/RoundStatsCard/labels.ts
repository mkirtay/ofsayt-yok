import type { StatUnit } from '@/services/sportmonks/roundStats';

type Translate = (key: string, opts?: Record<string, unknown>) => string;

/** "1st Qualifying Round" → "1stQualifyingRound", "Play-offs" → "playOffs" (roundStats.stages.* anahtarı). */
export function stageKey(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  return words.map((w, i) => (i === 0 ? (/^\d/.test(w) ? w : w.toLowerCase()) : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join('');
}

/** Sportmonks aşama adı (İngilizce) → çeviri; bilinmeyen ad aynen. */
export function stageLabel(name: string, t: Translate): string {
  const key = `stages.${stageKey(name)}`;
  const v = t(key);
  return v === key ? name : v;
}

/** Birim başlığı: "8. Hafta", "Lig Aşaması", birden çok haftalı aşamada "Şampiyonluk Grubu · 1. Hafta". */
export function unitLabel(unit: Pick<StatUnit, 'kind' | 'name' | 'stageName'>, t: Translate): string {
  if (unit.kind === 'stage') return stageLabel(unit.name, t);
  const round = /^\d+$/.test(unit.name) ? t('roundName', { n: unit.name }) : unit.name;
  return unit.stageName ? `${stageLabel(unit.stageName, t)} · ${round}` : round;
}

/** "16–19 Eki" / "16 Eki – 2 Kas" (tek gün: "16 Eki"). */
export function unitDateRange(start: string | null, end: string | null, locale: string): string | null {
  if (!start) return null;
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  if (!end || end === start) return fmt.format(d(start));
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const day = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', timeZone: 'UTC' });
    return `${day.format(d(start))}–${fmt.format(d(end))}`;
  }
  return `${fmt.format(d(start))} – ${fmt.format(d(end))}`;
}
