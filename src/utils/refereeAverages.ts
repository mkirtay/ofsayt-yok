/** Hakem maç başı oranları — sunucu (hakem sayfası özeti) ve istemci (tablo yan paneli, UEFA kariyeri) ortak. */
export type RefereeRates = { yellow: number | null; red: number | null; penalties: number | null; var: number | null; fouls?: number | null };

export type RateLine = {
  matches: number;
  yellowPerMatch: number | null;
  redPerMatch: number | null;
  penaltiesPerMatch: number | null;
  varPerMatch: number | null;
  foulsPerMatch?: number | null;
};

/** Maç ağırlıklı ortalama (değeri olmayan satırlar hem paydan hem paydadan düşer). */
export function weightedRates(lines: readonly RateLine[]): RefereeRates {
  const avg = (get: (l: RateLine) => number | null | undefined) => {
    let total = 0;
    let matches = 0;
    for (const l of lines) {
      const v = get(l);
      if (v == null || l.matches <= 0) continue;
      total += v * l.matches;
      matches += l.matches;
    }
    return matches > 0 ? Math.round((total / matches) * 100) / 100 : null;
  };
  return { yellow: avg((l) => l.yellowPerMatch), red: avg((l) => l.redPerMatch), penalties: avg((l) => l.penaltiesPerMatch), var: avg((l) => l.varPerMatch) };
}

/** Fouls dahil (tablo yan paneli). */
export function weightedRatesWithFouls(lines: readonly RateLine[]): RefereeRates & { fouls: number | null } {
  const base = weightedRates(lines);
  const fouls = weightedRates(lines.map((l) => ({ ...l, yellowPerMatch: l.foulsPerMatch ?? null }))).yellow;
  return { ...base, fouls };
}
