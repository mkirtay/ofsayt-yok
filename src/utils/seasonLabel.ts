/** API "2025/2026" → gösterim "2025-2026" */
export function formatSeasonLabel(name: string): string {
  return name.trim().replace(/\s*\/\s*/g, '-');
}
