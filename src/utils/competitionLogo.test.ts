import { describe, expect, it } from 'vitest';
import { competitionLogoNeedsBackdrop } from './competitionLogo';

describe('competitionLogoNeedsBackdrop', () => {
  it('koyu şeffaf UEFA logoları (UCL/UEL/UECL Sportmonks id) zemin alır', () => {
    expect(competitionLogoNeedsBackdrop(2)).toBe(true);
    expect(competitionLogoNeedsBackdrop(5)).toBe(true);
    expect(competitionLogoNeedsBackdrop(2286)).toBe(true);
  });

  it('diğer ligler ve eksik id dokunulmaz', () => {
    expect(competitionLogoNeedsBackdrop(600)).toBe(false); // Süper Lig
    expect(competitionLogoNeedsBackdrop(244)).toBe(false); // legacy UCL id (svg kullanır)
    expect(competitionLogoNeedsBackdrop(undefined)).toBe(false);
    expect(competitionLogoNeedsBackdrop(null)).toBe(false);
  });
});
