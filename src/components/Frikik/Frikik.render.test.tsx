import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Frikik, { resultLabel } from './index';
import tr from '../../../public/locales/tr/frikik.json';
import en from '../../../public/locales/en/frikik.json';

const read = (p: string) => readFileSync(path.join(process.cwd(), p), 'utf8');

describe('<Frikik />', () => {
  it('sunucu HTML\'i: başlık, sabit yükseklikte boş oyun alanı (sahne istemcide sonradan), kurallar; paylaşılan skor bandı', () => {
    const html = renderToStaticMarkup(<Frikik shared={null} />);
    expect(html).toContain('>Frikik</h1>');
    expect(html).toMatch(/role="application" aria-label="Frikik oyun alanı"><div class="[^"]*"><\/div><\/div>/);
    expect(html).toContain(tr.rules.p3);
    expect(html).not.toContain('Bir arkadaşın');
    expect(renderToStaticMarkup(<Frikik shared={{ score: 850, level: null }} />)).toContain('Bir arkadaşın 850 puan yaptı');
    const lvl = renderToStaticMarkup(<Frikik shared={{ score: 1250, level: 7 }} />);
    expect(lvl).toContain('7. seviyeye ulaştı');
    expect(lvl).toContain('role="tablist"');
  });

  it('three.js yalnız dinamik import ile: bileşen ve sayfa statik olarak three / sahneyi içe aktarmaz', () => {
    for (const f of ['src/components/Frikik/index.tsx', 'src/pages/frikik.tsx', 'src/components/pitch3d/webgl.ts']) {
      const src = read(f);
      expect(src, f).not.toMatch(/from ['"]three/);
      expect(src, f).not.toMatch(/^import (?!type )[^;]*from ['"][^'"]*(frikikScene|pitchKit)['"]/m);
    }
    expect(read('src/components/Frikik/index.tsx')).toMatch(/import\(['"]\.\/frikikScene['"]\)/);
  });

  it('sonuç etiketi: doksan > direkten gol > gol; gol değilse türü', () => {
    const t = (k: string) => k;
    expect(resultLabel({ kind: 'goal', points: 250, viaPost: true, corner: true }, t)).toBe('result.corner');
    expect(resultLabel({ kind: 'goal', points: 150, viaPost: true, corner: false }, t)).toBe('result.viaPost');
    expect(resultLabel({ kind: 'goal', points: 100, viaPost: false, corner: false }, t)).toBe('result.goal');
    expect(resultLabel({ kind: 'wall', points: 0, viaPost: false, corner: false }, t)).toBe('result.wall');
  });

  it('TR / EN sözlükleri aynı anahtarlara sahip', () => {
    const keys = (o: object, pre = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as object, `${pre}${k}.`) : [`${pre}${k}`]));
    expect(keys(en).sort()).toEqual(keys(tr).sort());
  });
});
