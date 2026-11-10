import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import trCombo from '../../../public/locales/tr/combo.json';
import enCombo from '../../../public/locales/en/combo.json';

describe('<ComboHomeCard />', () => {
  it('kapalı başlar: tek satır başlık, aria-expanded=false, panel ve istek yok', async () => {
    const { default: ComboHomeCard } = await import('./index');
    const html = renderToStaticMarkup(<ComboHomeCard />);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('Günün Kombinesi');
    expect(html).not.toContain('id="combo-home-card-panel"');
    expect(html).not.toContain('{{');
  });

  it('TR ve EN sözlük aynı anahtarlara sahip; "yaklaşık piyasa oranı" ve garanti-değil uyarısı var', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(enCombo).sort()).toEqual(keys(trCombo).sort());
    expect(trCombo.oddLabel).toBe('yaklaşık piyasa oranı');
    expect(trCombo.disclaimer).toContain('garanti değildir');
    expect(enCombo.disclaimer).toContain('Nothing is guaranteed');
  });

  it('kapı: ana sayfa kartı yalnız oturumdaki comboAccess ile, next/dynamic (ssr:false) ile yüklenir; sunucu çıktısına girmez', () => {
    const src = readFileSync(path.resolve(__dirname, '../MatchHubPage/index.tsx'), 'utf8');
    expect(src).toMatch(/dynamic\(\(\) => import\('@\/components\/ComboHomeCard'\), \{ ssr: false \}\)/);
    expect(src).toContain('sessionData?.user?.comboAccess ? <ComboHomeCard />');
    expect(src).not.toMatch(/^import ComboHomeCard/m);
  });

  it('görünür metinlerde bahis dili yok (yalnız zorunlu "piyasa" etiketi serbest)', () => {
    const values = (o: unknown): string[] => Object.values(o as Record<string, unknown>).flatMap((v) => (v && typeof v === 'object' ? values(v) : [String(v)]));
    const text = values({ ...trCombo, oddLabel: '', disclaimer: '' }).join(' | ');
    expect(findGamblingTerms(text)).toEqual([]);
  });
});
