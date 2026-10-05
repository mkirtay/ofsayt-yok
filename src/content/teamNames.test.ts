import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TEAM_NAMES } from './teamNames';

const entries = Object.entries(TEAM_NAMES).map(([id, e]) => ({ id: Number(id), ...e }));

describe('takım ad sözlüğü', () => {
  it('60–80 kayıt; id kaynak dosyada bir kez geçiyor (benzersiz), pozitif tam sayı', () => {
    expect(entries.length).toBeGreaterThanOrEqual(60);
    expect(entries.length).toBeLessThanOrEqual(80);
    const src = readFileSync(path.resolve(__dirname, 'teamNames.ts'), 'utf8');
    const keys = [...src.matchAll(/^\s+(\d+): \{/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(entries.length);
    for (const e of entries) expect(Number.isInteger(e.id) && e.id > 0).toBe(true);
  });

  it('tam ad, kısa ad ve takma adlar boş değil; kısa ad tam addan kısa; takma adlar tekrarsız', () => {
    for (const e of entries) {
      expect(e.name.trim(), String(e.id)).not.toBe('');
      expect(e.shortName.trim(), e.name).not.toBe('');
      expect(e.shortName.length, e.name).toBeLessThan(e.name.length);
      expect(e.aliases.length, e.name).toBeGreaterThan(0);
      for (const a of e.aliases) expect(a.trim(), e.name).not.toBe('');
      expect(new Set(e.aliases).size, e.name).toBe(e.aliases.length);
    }
  });

  it('kapsam: Süper Lig\'in 18 takımı, 375 px\'te kesilen adlar (PSG, Dortmund, Atlético, Man City, Slovan, Seattle)', () => {
    const superLig = [347, 3570, 554, 13818, 3224, 88, 34, 4192, 286, 3897, 1071, 13860, 2632, 1041, 2811, 688, 13871, 3702];
    for (const id of superLig) expect(TEAM_NAMES[id], String(id)).toBeDefined();
    expect(TEAM_NAMES[591].shortName).toBe('PSG');
    expect(TEAM_NAMES[68].shortName).toBe('Dortmund');
    expect(TEAM_NAMES[7980].shortName).toBe('Atlético');
    expect(TEAM_NAMES[9].shortName).toBe('Man City');
    expect(TEAM_NAMES[2417].shortName).toBe('Slovan');
    expect(TEAM_NAMES[2649].shortName).toBe('Seattle');
    expect(TEAM_NAMES[34].aliases).toEqual(expect.arrayContaining(['Cimbom', 'Aslan', 'GS']));
    expect(TEAM_NAMES[688].aliases).toEqual(expect.arrayContaining(['Trabzon', 'Fırtına', 'TS']));
  });

  it('aliases yalnız AI asistanın takım çözümlemesinde okunur', () => {
    const root = path.resolve(__dirname, '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f) && !/teamNames(\.test)?\.ts$/.test(f)) files.push(p);
      }
    };
    walk(root);
    const users = files.filter((f) => /TEAM_NAMES|content\/teamNames/.test(readFileSync(f, 'utf8')));
    const readers = users.filter((f) => /\.aliases\b/.test(readFileSync(f, 'utf8'))).map((f) => path.relative(root, f));
    expect(readers).toEqual([path.join('server', 'assistant', 'matchAnalysisRequest.ts')]);
  });
});
