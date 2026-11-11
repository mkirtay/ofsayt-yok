import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import trCombo from '../../../public/locales/tr/combo.json';
import enCombo from '../../../public/locales/en/combo.json';

describe('<ComboHomeCard />', () => {
  const leg = (id: string, key: string, pct: number, refOdd: number | null, home = 'İngiltere', away = 'Hırvatistan') => ({
    matchId: id, homeName: home, awayName: away, homeLogo: null, awayLogo: null, kickoffIso: null, key, pct, modelPct: 70, marketPct: refOdd ? 73.6 : null, fairOdd: Math.round((100 / pct) * 100) / 100, refOdd, national: true, source: 'test' as const,
  });
  const coupon = (kind: string, fairOdds: number, refOdds: number | null, legs = [leg('1', 'under35', 72.8, 1.33), leg('2', 'over25', 77, null, 'Çok Uzun Takım Adı Spor Kulübü', 'Bir Başka Çok Uzun Takım Adı')]) => ({
    kind, legs, probability: 0.486, fairOdds, refOdds,
  });
  const ready = (testData = true) =>
    ({
      state: 'ready',
      payload: { date: '2026-11-12', generatedAt: '', status: 'ok', analysed: 5, testData, coupons: [coupon('safe', 2.06, null), coupon('balanced', 4.2, 3.9, [leg('3', 'bttsNo', 61, 1.7)]), coupon('bold', 9.5, null)] },
    }) as never;

  async function presets(state: never, kind: 'safe' | 'balanced' | 'bold' = 'safe') {
    const { DailyPresets } = await import('./index');
    const { useTranslation } = await import('@/lib/i18n');
    const Wrap = () => {
      const { t } = useTranslation('combo');
      return <DailyPresets state={state} kind={kind} onKind={() => {}} t={t as never} />;
    };
    return renderToStaticMarkup(<Wrap />);
  }

  it('kart açık gelir (aç/kapa düğmesi yok), Bugün seçili, "Kendin ayarla" kapalı, giriş paragrafı yok', async () => {
    const { default: ComboHomeCard } = await import('./index');
    const html = renderToStaticMarkup(<ComboHomeCard />);
    expect(html).toContain('Günün Kombinesi');
    expect(html).not.toContain('aria-expanded');
    expect(html).toMatch(/aria-pressed="true">Bugün</);
    expect(html).toMatch(/aria-pressed="false">Yarın</);
    expect(html).toContain('Yükleniyor');
    expect(html).toContain('Kendin ayarla');
    expect(html).not.toMatch(/<details[^>]*open/);
    expect(html).not.toContain('otomatik havuzdan');
    expect(html).not.toContain('{{');
  });

  it('hazır: üç sekme, Temkinli seçili, YALNIZ seçili kupon (adil oran + olasılık; bacakta pazar · % · adil oran; referans oran yalnız ayrıntıda)', async () => {
    const safe = await presets(ready());
    expect(safe).toMatch(/aria-selected="true"[^>]*>Temkinli</);
    expect(safe).toContain('Dengeli');
    expect(safe).toContain('Riskli');
    expect(safe).toContain('Adil oran');
    expect(safe).toContain('2,06');
    expect(safe).toContain('Olasılık');
    expect(safe).toContain('%48,6');
    expect(safe).toContain('İngiltere – Hırvatistan');
    expect(safe).toContain('En çok 3 gol · %73');
    expect(safe).toContain('1,37'); // 1 / %72,8
    expect(safe).toContain('3+ gol · %77');
    expect(safe).toContain('2 maç');
    expect(safe).toContain('Sonuç garantisi yok.');
    expect(safe).toContain('Kendi sitendeki oran');
    const main = safe.slice(0, safe.indexOf('<details'));
    expect(main).not.toContain('1,33'); // uluslararası referans ana görünümde yok
    const det = safe.slice(safe.indexOf('<details'));
    expect(det).toContain('referans 1,33');
    expect(det).toContain('oranlardan %73,6');
    expect(det).toContain('oranlardan —');
    expect(safe).not.toContain('bulamaz'); // diğer kuponun maçı görünmez
    const balanced = await presets(ready(), 'balanced');
    expect(balanced).toMatch(/aria-selected="true"[^>]*>Dengeli</);
    expect(balanced).toContain('4,20');
    expect(balanced).toContain('En az bir takım gol bulamaz');
    expect(balanced).toContain('1 maç');
    expect(balanced).toContain('3,90'); // kombine referans (ayrıntı)
    expect(balanced).not.toContain('2,06');
  });

  it('hata / bekleme / veri yok: tek kısa mesaj; "Test" rozeti kartta yalnız test verisinde', async () => {
    expect(await presets({ state: 'error' } as never)).toContain('Yüklenemedi');
    expect(await presets({ state: 'pending', at: '12:00' } as never)).toContain('12:00');
    expect(await presets({ state: 'ready', payload: { status: 'insufficient', coupons: [], testData: false } } as never)).toContain('yeterli veri yok');
    // Önbellekte kalmış eski biçim (odds/odd, adil oran yok) çökertmez.
    const old = { status: 'ok', testData: false, coupons: [{ kind: 'safe', odds: 2.84, probability: 0.2, legs: [{ matchId: '1', homeName: 'A', awayName: 'B', key: 'over15', pct: 80, odd: 1.4 }] }] };
    expect(await presets({ state: 'ready', payload: old } as never)).toContain('yeterli veri yok');
    const src = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
    expect(src).toContain('showTestBadge = dailyState.state === \'ready\' && dailyState.payload.testData');
  });

  it('kart gövdesinde sabit değer yok: rakamlar veriden', () => {
    const src = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
    expect(src).not.toMatch(/2[,.]06|48[,.]6/);
  });

  it('TR ve EN sözlük aynı anahtarlara sahip; "yaklaşık piyasa oranı" ve garanti-değil uyarısı var', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(enCombo).sort()).toEqual(keys(trCombo).sort());
    expect(trCombo.oddLabel).toBe('yaklaşık piyasa oranı');
    expect(trCombo.presets.safe).toBe('Temkinli');
    expect(enCombo.presets.safe).toBe('Cautious');
    expect('intro' in trCombo).toBe(false);
    expect(trCombo.disclaimer).toContain('garanti değildir');
    expect(enCombo.disclaimer).toContain('Nothing is guaranteed');
  });

  it('kapı: ana sayfa kartı yalnız oturumdaki comboAccess ile, next/dynamic (ssr:false) ile yüklenir; sunucu çıktısına girmez', () => {
    const src = readFileSync(path.resolve(__dirname, '../MatchHubPage/index.tsx'), 'utf8');
    expect(src).toMatch(/dynamic\(\(\) => import\('@\/components\/ComboHomeCard'\), \{ ssr: false \}\)/);
    expect(src).toContain('Boolean(sessionData?.user?.comboAccess)');
    expect(src).toMatch(/comboAccess && !isMobileLayout \? \(/);
    expect(src).toMatch(/comboAccess && isMobileLayout/);
    expect(src).not.toMatch(/^import ComboHomeCard/m);
  });

  it('görünür metinlerde bahis dili yok (yalnız zorunlu "piyasa" etiketi serbest)', () => {
    const values = (o: unknown): string[] => Object.values(o as Record<string, unknown>).flatMap((v) => (v && typeof v === 'object' ? values(v) : [String(v)]));
    const text = values({ ...trCombo, oddLabel: '', disclaimer: '', marketOdds: { ...trCombo.marketOdds, title: '', result: '', doubleChance: '', firstHalf: '', drawNoBet: '', btts: '', goals: '', handicap: '' } }).join(' | ');
    expect(findGamblingTerms(text)).toEqual([]);
  });
});
