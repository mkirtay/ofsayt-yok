import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ locale: 'tr' }),
  useTranslation: () => ({ t: (k: string, o?: Record<string, unknown>) => (o ? `${k}${JSON.stringify(o)}` : k) }),
}));

// Sunucu yanıtı: bileşenin `null` başlangıçlı ilk state'i (data) sabit veriyle doldurulur — fetch effect'i SSR'da çalışmaz.
const fan = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useState: (init: unknown) => (init === null && fan.value ? [fan.value, () => {}] : actual.useState(init as never)) };
});

import RefereeFanRating from './RefereeFanRating';

const decode = (s: string) => s.replace(/&quot;/g, '"');
const recent = (count: number, average = 7.25) => ({ matchId: '19746563', homeName: 'Eyüpspor', awayName: 'Kocaelispor', kickoffAt: '2026-11-07T10:30:00.000Z', average, count });

afterEach(() => {
  fan.value = null;
});

describe('RefereeFanRating', () => {
  it('yükleniyor: iskelet (sabit yer)', () => {
    const html = renderToStaticMarkup(<RefereeFanRating refereeId={1} />);
    expect(html).toContain('refereeRating.fanTitle');
    expect(html).toContain('aria-busy="true"');
  });

  it('5 oydan az: ortalama yerine "yetersiz oy"; maç satırında ortalama yerine —', () => {
    fan.value = { average: 8.5, count: 4, recent: [recent(4, 8.5)] };
    const html = decode(renderToStaticMarkup(<RefereeFanRating refereeId={1} />));
    expect(html).toContain('refereeRating.fanInsufficient<');
    expect(html).not.toContain('8,5');
    expect(html).toContain('refereeRating.fanVotes{"count":4}');
    expect(html).toContain('/matches/19746563-eyupspor-kocaelispor');
    expect(html).toContain('—');
  });

  it('yeterli oy: ortalama tek ondalık (tr) + oy sayısı + son maçlar', () => {
    fan.value = { average: 6.4, count: 37, recent: [recent(24, 5.8)] };
    const html = decode(renderToStaticMarkup(<RefereeFanRating refereeId={1} />));
    expect(html).toContain('6,4');
    expect(html).toContain('5,8');
    expect(html).toContain('refereeRating.fanVotes{"count":37}');
    expect(html).not.toContain('refereeRating.fanInsufficient<');
  });

  it('hiç oy yok: boş durum metni', () => {
    fan.value = { average: null, count: 0, recent: [] };
    expect(renderToStaticMarkup(<RefereeFanRating refereeId={1} />)).toContain('refereeRating.fanNone');
  });
});
