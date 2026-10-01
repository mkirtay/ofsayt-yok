import { describe, expect, it } from 'vitest';
import { normalizeDisplayName, normalizeTeamName } from './displayName';
import { buildMatchHref, buildMatchSlug } from './matchUrl';
import { mapSportmonksFixtureToMatch } from '@/services/sportmonksFixtureMapper';
import type { SportmonksFixture } from '@/services/sportmonks/types';

const DOT = '̇';

describe('normalizeDisplayName', () => {
  it('"i + U+0307" → "i"', () => {
    expect(normalizeDisplayName(`Emi${DOT}r`)).toBe('Emir');
    expect(normalizeDisplayName(`Sevgi${DOT}li${DOT}`)).toBe('Sevgili');
    expect(normalizeDisplayName(`Ahmet Emi${DOT}r Çarktan`)).toBe('Ahmet Emir Çarktan');
  });

  it('"I + U+0307" → "İ" (NFC)', () => {
    expect(normalizeDisplayName(`I${DOT}smet`)).toBe('İsmet');
    expect(normalizeDisplayName(`I${DOT}smet`)).toBe('İsmet');
  });

  it('zaten temiz ad değişmez (aynı referans değeri)', () => {
    for (const name of ['Arda Güler', 'İsmail Yüksek', 'Ștefan Lefter', 'Murad Məmmədov', 'Sánchez López', 'Ødegaard', '']) {
      expect(normalizeDisplayName(name)).toBe(name);
    }
    expect(normalizeDisplayName(undefined)).toBeUndefined();
    expect(normalizeDisplayName(null)).toBeNull();
  });

  it('yumuşak tire ve ayrık U+0302 / U+030C korunur', () => {
    const softHyphen = 'Þór­halls­son';
    expect(normalizeDisplayName(softHyphen)).toBe(softHyphen);
    // Önceden birleşik karşılığı olmayan tabanlar: NFC dokunmaz
    expect(normalizeDisplayName('x̂')).toBe('x̂');
    expect(normalizeDisplayName('q̌')).toBe('q̌');
  });
});

describe('slug değişmez', () => {
  const slugOf = (home: string, away: string) => buildMatchSlug({ home: { name: home }, away: { name: away } });

  it('normalize edilen takım adının slug\'ı ham adınkiyle birebir aynı', () => {
    const raw = [`I${DOT}stanbulspor`, 'Fenerbahçe', 'Başakşehir FK', 'Atlético Madrid', 'FC København', 'Qarabağ'];
    for (const name of raw) {
      expect(slugOf(normalizeTeamName(name), 'Galatasaray')).toBe(slugOf(name, 'Galatasaray'));
    }
  });

  it('normalize slug\'ı değiştirecekse takım adı ham kalır (mevcut URL korunur)', () => {
    // "Emi̇r" slug'ı ham hâlde "emi-r"; normalize edilse "emir" olurdu → ad değişmez
    expect(normalizeTeamName(`Emi${DOT}rspor`)).toBe(`Emi${DOT}rspor`);
    // Ayrık é: ham slug "cafe-fc", NFC "Café" → "caf-fc" olurdu → ad değişmez
    expect(normalizeTeamName('Café FC')).toBe('Café FC');
  });

  it('Sportmonks fixture mapper: görünen ad normalize, URL birebir aynı', () => {
    const fixture = {
      id: 19745050,
      name: 'x',
      starting_at: '2026-10-02 18:30:00',
      starting_at_timestamp: 1790965800,
      state_id: 1,
      participants: [
        { id: 1, name: `I${DOT}stanbulspor`, image_path: null, meta: { location: 'home' } },
        { id: 2, name: 'Real Oviedo', image_path: null, meta: { location: 'away' } },
      ],
    } as unknown as SportmonksFixture;
    const match = mapSportmonksFixtureToMatch(fixture);
    expect(match.home?.name).toBe('İstanbulspor');
    const rawHref = buildMatchHref({ id: match.id, home: { name: `I${DOT}stanbulspor` }, away: { name: 'Real Oviedo' } });
    expect(buildMatchHref(match)).toBe(rawHref);
  });
});
