import { describe, expect, it } from 'vitest';
import { competitionLogoNeedsBackdrop } from './competitionLogo';

describe('competitionLogoNeedsBackdrop', () => {
  it('koyu şeffaf UEFA logoları (UCL/UEL/UECL Sportmonks id) zemin alır', () => {
    expect(competitionLogoNeedsBackdrop(2)).toBe(true);
    expect(competitionLogoNeedsBackdrop(5)).toBe(true);
    expect(competitionLogoNeedsBackdrop(2286)).toBe(true);
  });

  it('koyu temada kaybolan diğer lig logoları (2026-10-02 taraması) zemin alır', () => {
    for (const id of [8, 9, 72, 208, 271, 501, 570, 603, 1282, 1283, 1328]) expect(competitionLogoNeedsBackdrop(id)).toBe(true);
  });

  it('diğer ligler ve eksik id dokunulmaz', () => {
    expect(competitionLogoNeedsBackdrop(600)).toBe(false); // Süper Lig (sınırda: kırmızı kısmı net)
    expect(competitionLogoNeedsBackdrop(564)).toBe(false); // La Liga
    expect(competitionLogoNeedsBackdrop(779)).toBe(false); // MLS
    expect(competitionLogoNeedsBackdrop(244)).toBe(false); // legacy UCL id (svg kullanır)
    expect(competitionLogoNeedsBackdrop(undefined)).toBe(false);
    expect(competitionLogoNeedsBackdrop(null)).toBe(false);
  });
});
