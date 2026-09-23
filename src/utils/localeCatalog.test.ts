import { describe, expect, it } from 'vitest';
import { PLAYER_STAT_GROUPS } from '@/services/sportmonks/playerStatTypes';
import trPlayer from '../../public/locales/tr/player.json';
import enPlayer from '../../public/locales/en/player.json';
import trCompare from '../../public/locales/tr/compare.json';
import enCompare from '../../public/locales/en/compare.json';

type Dict = Record<string, unknown>;

/** İç içe sözlüğü "a.b.c" düz anahtarlara açar. */
function flatten(obj: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [ik, iv] of flatten(v as Dict, key)) out.set(ik, iv);
    } else {
      out.set(key, String(v));
    }
  }
  return out;
}

const CATALOGS = [
  { ns: 'player', tr: flatten(trPlayer as Dict), en: flatten(enPlayer as Dict) },
  { ns: 'compare', tr: flatten(trCompare as Dict), en: flatten(enCompare as Dict) },
];

describe.each(CATALOGS)('$ns sözlüğü', ({ tr, en }) => {
  it('tr ve en aynı anahtar kümesine sahip', () => {
    expect([...en.keys()].sort()).toEqual([...tr.keys()].sort());
  });

  it('hiçbir değer boş değil', () => {
    for (const [dictName, dict] of [['tr', tr], ['en', en]] as const) {
      for (const [k, v] of dict) expect(v.trim().length, `${dictName}:${k}`).toBeGreaterThan(0);
    }
  });

  it('interpolasyon yer tutucuları iki dilde de aynı', () => {
    const vars = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    for (const [k, trVal] of tr) {
      expect(vars(en.get(k)!), `${k}`).toEqual(vars(trVal));
    }
  });
});

describe('oyuncu istatistik tablosu', () => {
  it('her `labelKey` ve grup `key` iki dilde de çevrilmiş', () => {
    const tr = flatten(trPlayer as Dict);
    const en = flatten(enPlayer as Dict);
    for (const g of PLAYER_STAT_GROUPS) {
      expect(tr.has(`statGroups.${g.key}`), `tr statGroups.${g.key}`).toBe(true);
      expect(en.has(`statGroups.${g.key}`), `en statGroups.${g.key}`).toBe(true);
      for (const d of g.stats) {
        expect(tr.has(`stats.${d.labelKey}`), `tr stats.${d.labelKey}`).toBe(true);
        expect(en.has(`stats.${d.labelKey}`), `en stats.${d.labelKey}`).toBe(true);
      }
    }
  });

  it('Türkçe çeviri, koddaki yedek `label`/`title` ile birebir aynı (yedek sessizce eskimesin)', () => {
    const tr = flatten(trPlayer as Dict);
    for (const g of PLAYER_STAT_GROUPS) {
      expect(tr.get(`statGroups.${g.key}`), g.key).toBe(g.title);
      for (const d of g.stats) expect(tr.get(`stats.${d.labelKey}`), d.labelKey).toBe(d.label);
    }
  });

  it('`labelKey` değerleri benzersiz (iki istatistik aynı anahtarı paylaşmıyor)', () => {
    const keys = PLAYER_STAT_GROUPS.flatMap((g) => g.stats.map((d) => d.labelKey));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
