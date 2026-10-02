import { readFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import TeamNameLabel, { SHORT_NAME_MIN_CHARS, narrowTeamName } from './TeamNameLabel';

describe('maç satırı takım adı (dar ekranda kısa ad)', () => {
  it('uzun ad + sözlükte kısa ad: tam ad (title + ekran okuyucu) ve aria-hidden kısa ad birlikte çizilir', () => {
    const html = renderToStaticMarkup(<TeamNameLabel teamId={591} name="Paris Saint Germain" className="tn" />);
    expect(html).toContain('title="Paris Saint Germain"');
    expect(html).toMatch(/<span class="[^"]*teamNameFull[^"]*">Paris Saint Germain<\/span>/);
    expect(html).toMatch(/<span class="[^"]*teamNameShort[^"]*" aria-hidden="true">PSG<\/span>/);
  });

  it('sözlükte kayıt yoksa ya da ad eşikten kısaysa yalnız tam ad (ellipsis CSS\'te)', () => {
    expect(renderToStaticMarkup(<TeamNameLabel teamId={999999} name="Sporting Hortaleza" className="tn" />)).toBe(
      '<span class="tn">Sporting Hortaleza</span>',
    );
    // Galatasaray (11 karakter) sözlükte var ama sığıyor → kısa ad yok
    expect(renderToStaticMarkup(<TeamNameLabel teamId={34} name="Galatasaray" className="tn" />)).toBe(
      '<span class="tn">Galatasaray</span>',
    );
    expect(narrowTeamName(undefined, 'Paris Saint Germain')).toBeNull();
  });

  it('eşik 13 karakter (375 px ölçümü): 13 ve üstü kısa ada geçer', () => {
    expect(SHORT_NAME_MIN_CHARS).toBe(13);
    expect(narrowTeamName(2673, 'Crvena Zvezda')).toBe('C. Zvezda'); // 13
    expect(narrowTeamName(3702, 'İstanbul Başakşehir')).toBe('Başakşehir');
  });

  it('kısa ad yalnız 640 px altında görünür; üstünde tam ad (masaüstü değişmez)', () => {
    const scss = readFileSync(path.resolve(__dirname, 'matchList.module.scss'), 'utf8');
    expect(scss).toMatch(/\.teamNameShort\s*\{\s*display:\s*none;/);
    expect(scss).toMatch(/@media \(max-width: #\{\$bp-sm - 1px\}\) \{\s*\.teamNameFull \{[^}]*clip-path: inset\(50%\)[^}]*\}\s*\.teamNameShort \{\s*display: inline;/);
  });
});
