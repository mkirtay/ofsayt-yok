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

describe('standingTeamShortCode — TEAM_SHORT_NAMES override', () => {
  it('override short_code\'dan önce gelir (team.id veya team_id)', () => {
    expect(standingTeamShortCode({ team: { id: 34, name: 'Galatasaray', short_code: 'GAL' } })).toBe('GS');
    expect(standingTeamShortCode({ team_id: 554, name: 'Beşiktaş', short_code: 'BES' })).toBe('BJK');
  });

  it('Türkçe karakterler korunur (İ, Ç, Ö)', () => {
    expect(standingTeamShortCode({ team: { id: 3702, name: 'İstanbul Başakşehir', short_code: 'IBA' } })).toBe('İBFK');
    expect(standingTeamShortCode({ team: { id: 1041, name: 'Rizespor', short_code: 'RIZ' } })).toBe('ÇRS');
    expect(standingTeamShortCode({ team: { id: 3897, name: 'Göztepe', short_code: 'GOZ' } })).toBe('GÖZ');
  });

  it('override short_code geçersiz/yoksa da uygulanır', () => {
    expect(standingTeamShortCode({ team: { id: 88, name: 'Fenerbahçe', short_code: null } })).toBe('FB');
  });

  it('tablo dışı takım → short_code, o da yoksa undefined (tam isim)', () => {
    expect(standingTeamShortCode({ team: { id: 85, name: 'Paris Saint Germain', short_code: 'PSG' } })).toBe('PSG');
    expect(standingTeamShortCode({ team: { id: 999999, name: 'X', short_code: null } })).toBeUndefined();
    expect(standingTeamLabel({ team: { id: 999999, name: 'X', short_code: null } }, true).text).toBe('X');
  });

  it('kısaltmalı etikette fullName yine tam isim', () => {
    expect(standingTeamLabel({ team: { id: 3702, name: 'İstanbul Başakşehir' } }, true)).toEqual({
      text: 'İBFK',
      abbreviated: true,
      fullName: 'İstanbul Başakşehir',
    });
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
