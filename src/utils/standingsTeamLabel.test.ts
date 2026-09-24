import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MINI_STANDINGS_COMPACT_MAX_WIDTH,
  STANDINGS_COMPACT_MAX_WIDTH,
  standingTeamLabel,
  standingTeamShortCode,
} from './standingsTeamLabel';

describe('standingTeamShortCode', () => {
  it('team.short_code önce, yoksa satırın kendi alanı; büyük harf', () => {
    expect(standingTeamShortCode({ team: { name: 'Galatasaray', short_code: 'GAL' } })).toBe('GAL');
    expect(standingTeamShortCode({ name: 'Göztepe', short_code: 'goz' })).toBe('GOZ');
  });

  it('boş / null / uzun / boşluklu → undefined', () => {
    for (const short_code of [null, undefined, '', ' ', 'G', 'ABCDEF', 'G S']) {
      expect(standingTeamShortCode({ name: 'X', short_code })).toBeUndefined();
    }
  });
});

describe('standingTeamLabel — kural', () => {
  const gal = { team: { name: 'Galatasaray', short_code: 'GAL' } };
  const noCode = { team: { name: 'Esenler Erokspor', short_code: null } };

  it('geniş kapsayıcıda her zaman tam isim', () => {
    expect(standingTeamLabel(gal, false)).toEqual({ text: 'Galatasaray', abbreviated: false, fullName: 'Galatasaray' });
  });

  it('dar kapsayıcıda kısaltma; tam isim tooltip/aria için korunur', () => {
    expect(standingTeamLabel(gal, true)).toEqual({ text: 'GAL', abbreviated: true, fullName: 'Galatasaray' });
  });

  it('dar ama short_code yoksa tam isim (ellipsis CSS\'te)', () => {
    expect(standingTeamLabel(noCode, true)).toEqual({ text: 'Esenler Erokspor', abbreviated: false, fullName: 'Esenler Erokspor' });
  });

  it('isim de yoksa "—"', () => {
    expect(standingTeamLabel({}, true).text).toBe('—');
  });
});

describe('eşikler SCSS container query ile senkron', () => {
  it('standingTeamName.module.scss eşikleri = TS sabitleri', () => {
    const scss = readFileSync(new URL('../components/StandingTeamName/standingTeamName.module.scss', import.meta.url), 'utf8');
    const widths = [...scss.matchAll(/@container \(max-width: ([\d.]+)px\)/g)].map((m) => Math.ceil(Number(m[1])));
    expect(widths).toEqual([STANDINGS_COMPACT_MAX_WIDTH, MINI_STANDINGS_COMPACT_MAX_WIDTH]);
  });
});
