import { describe, expect, it, vi, afterEach } from 'vitest';
import sharp from 'sharp';
import { renderMatchOgImage } from './matchOgImage';

/** Gerçek çizim (next/og): ağ yok — logolar çekilemezse baş harflerle; çıktı 1200×630 PNG. */
afterEach(() => vi.restoreAllMocks());

describe('renderMatchOgImage', () => {
  it('logolar gelmezse (ağ hatası) yine 1200×630 PNG üretir', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const img = await renderMatchOgImage({
      id: 1,
      status: 'FINISHED',
      time: '',
      scores: { score: '2-1' },
      home: { id: 1, name: 'Galatasaray', logo: 'https://cdn.sportmonks.com/images/soccer/teams/2/34.png' },
      away: { id: 2, name: 'Fenerbahçe', logo: 'https://cdn.sportmonks.com/images/soccer/teams/24/88.png' },
      competition: { id: 600, name: 'Süper Lig' },
    });
    const buf = Buffer.from(await img.arrayBuffer());
    const meta = await sharp(buf).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1200, 630]);
  });
});

import { matchOgCenter, matchOgStatus } from './matchOgImage';

const base = { id: 1, time: '', home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } };

describe('matchOgStatus / matchOgCenter', () => {
  it('canlı: "CANLI 67\'" + skor; devre arası; maç sonu', () => {
    const live = { ...base, status: 'IN PLAY', time: "67'", scores: { score: '1-0' } };
    expect(matchOgStatus(live)).toEqual({ kind: 'live', label: "CANLI 67'" });
    expect(matchOgCenter(live)).toEqual({ text: '1 – 0', score: ['1', '0'] });
    expect(matchOgStatus({ ...base, status: 'IN PLAY' })).toEqual({ kind: 'live', label: 'CANLI' });
    expect(matchOgStatus({ ...base, status: 'HALF TIME BREAK' })).toEqual({ kind: 'live', label: 'DEVRE ARASI' });
    expect(matchOgStatus({ ...base, status: 'FINISHED', score: '2-1' })).toEqual({ kind: 'badge', label: 'MAÇ SONU' });
  });

  it('başlamamış: TSİ saat ortada, tarih rozette (UTC 18:45 → 21:45)', () => {
    const m = { ...base, status: 'NOT STARTED', date: '2026-10-02', scheduled: '18:45' };
    expect(matchOgCenter(m)).toEqual({ text: '21:45', score: null });
    expect(matchOgStatus(m)).toEqual({ kind: 'date', label: '2 Ekim Cuma' });
  });

  it('özel durum: ertelendi → rozet + VS (saat gösterilmez); hükmen → skor', () => {
    const p = { ...base, status: 'NOT STARTED', state_code: 'POSTPONED' as const, date: '2026-10-02', scheduled: '18:45' };
    expect(matchOgStatus(p)).toEqual({ kind: 'badge', label: 'ERTELENDİ' });
    expect(matchOgCenter(p).text).toBe('VS');
    const w = { ...base, status: 'FINISHED', state_code: 'AWARDED' as const, score: '3-0' };
    expect(matchOgStatus(w).label).toBe('HÜKMEN');
    expect(matchOgCenter(w).score).toEqual(['3', '0']);
  });
});
