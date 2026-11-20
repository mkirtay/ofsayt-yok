import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import HistoryPanel from './HistoryPanel';
import { buildCouponHistory } from '@/utils/comboHistory';
import tr from '../../../public/locales/tr/combo.json';

const t = (key: string, opts?: Record<string, unknown>) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), tr);
  return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? '')) : key;
};
const leg = (id: string, key: string) => ({ matchId: id, homeName: `Ev ${id}`, awayName: `Dep ${id}`, key, pct: 70, fairOdd: 1.43 });
const S = new Date('2026-11-21T03:00:00Z');

describe('<HistoryPanel /> (Geçmiş sekmesi)', () => {
  const data = buildCouponHistory([
    { day: '2026-11-19', kind: 'safe', legs: [leg('1', 'over15'), leg('2', 'btts')], probability: 0.52, odds: null, settledAt: S, hit: true, legHits: [true, true] },
    { day: '2026-11-19', kind: 'bold', legs: [leg('3', 'under25'), leg('4', 'over25')], probability: 0.2, odds: null, settledAt: S, hit: false, legHits: [false, true] },
    { day: '2026-11-20', kind: 'balanced', legs: [leg('5', 'over25')], probability: 0.6, odds: null, settledAt: null, hit: null, legHits: [null] },
  ]);
  const html = renderToStaticMarkup(<HistoryPanel t={t} initial={data} />);

  it('özet: tutan / sonuçlanan, isabet yüzdesi, tür başına, bekleyen sayısı', () => {
    expect(html).toContain('Tuttu: 1 / 2 kupon (%50,0)');
    expect(html).toContain('1 kupon sonuç bekliyor.');
    expect(html).toMatch(/Temkinli<\/span><strong>1\/1/);
    expect(html).toMatch(/Riskli<\/span><strong>0\/1/);
  });

  it('gün gün kuponlar: durum etiketi ve maç başına ✓ / ✗ / •', () => {
    expect(html.indexOf('20 Kasım')).toBeLessThan(html.indexOf('19 Kasım'));
    for (const s of ['Tuttu', 'Tutmadı', 'Bekliyor']) expect(html).toContain(`>${s}</span>`);
    expect(html).toMatch(/aria-label="Tutmadı"[^>]*>✗/);
    expect(html).toMatch(/aria-label="Sonuç bekleniyor"[^>]*>•/);
  });

  it('kayıt yoksa açıklayıcı boş durum', () => {
    expect(renderToStaticMarkup(<HistoryPanel t={t} initial={buildCouponHistory([])} />)).toContain('Kuponlar her gün 17:30');
  });
});
