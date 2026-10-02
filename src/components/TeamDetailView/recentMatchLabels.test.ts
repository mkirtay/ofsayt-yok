import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { fullMatchDate, recentMatchStatus, shortMatchDate } from './recentMatchLabels';

const base = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'FINISHED', time: '', home: { id: 34, name: 'GS' }, away: { id: 2, name: 'X' }, ...over }) as Match;

describe('recentMatchLabels', () => {
  it('bitmiş maçta "MS" yerine TR gününe göre tarih', () => {
    const m = base({ date: '2026-09-19', scheduled: '17:00' });
    expect(recentMatchStatus(m)).toEqual({ kind: 'date', text: '19.09' });
    expect(fullMatchDate(m)).toBe('19.09.2026');
  });

  it('UTC 22:30 maçı TR\'de ertesi gün', () => {
    expect(shortMatchDate(base({ date: '2026-09-19', scheduled: '22:30' }))).toBe('20.09');
  });

  it('canlıda dakika, devre arasında İY', () => {
    expect(recentMatchStatus(base({ status: 'IN PLAY', time: "67'" }))).toEqual({ kind: 'live', text: "67'" });
    expect(recentMatchStatus(base({ status: 'HALF TIME BREAK' }))).toEqual({ kind: 'live', text: 'İY' });
  });

  it('ertelenmiş / iptal kısa durum', () => {
    expect(recentMatchStatus(base({ status: 'NOT STARTED', state_code: 'POSTPONED', date: '2026-09-01' }))).toMatchObject({
      kind: 'special',
      key: 'postponedShort',
    });
    expect(recentMatchStatus(base({ status: 'FINISHED', state_code: 'CANCELLED' }))).toMatchObject({ key: 'cancelledShort' });
  });
});

describe('nextMatchCountdown', () => {
  const m = (date: string, scheduled = '17:00') => base({ status: 'NOT STARTED', date, scheduled });
  it('bugün / yarın / N gün (TR günü)', async () => {
    const { nextMatchCountdown } = await import('./recentMatchLabels');
    expect(nextMatchCountdown(m('2026-10-02'), '2026-10-02')).toEqual({ kind: 'today', days: 0 });
    expect(nextMatchCountdown(m('2026-10-03'), '2026-10-02')).toEqual({ kind: 'tomorrow', days: 1 });
    expect(nextMatchCountdown(m('2026-10-09'), '2026-10-02')).toEqual({ kind: 'days', days: 7 });
    // UTC 22:30 = TR ertesi gün
    expect(nextMatchCountdown(m('2026-10-02', '22:30'), '2026-10-02')).toEqual({ kind: 'tomorrow', days: 1 });
    expect(nextMatchCountdown(m('2026-09-30'), '2026-10-02')).toBeNull();
  });
});

describe('countdownLabel (TR sözlüğüyle)', async () => {
  const tr = (await import('../../../public/locales/tr/team.json')).default as Record<string, unknown>;
  const { countdownLabel } = await import('./recentMatchLabels');
  const t = (key: string, opts: Record<string, unknown> = {}) => {
    const raw = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], tr) as string;
    return raw.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts[k]));
  };

  it('maç günü "Bugün 20:00", ertesi gün "Yarın 20:00", sonrası "N gün kaldı"', () => {
    expect(countdownLabel({ kind: 'today', days: 0 }, '20:00', t)).toBe('Bugün 20:00');
    expect(countdownLabel({ kind: 'tomorrow', days: 1 }, '19:45', t)).toBe('Yarın 19:45');
    expect(countdownLabel({ kind: 'days', days: 7 }, '20:00', t)).toBe('7 gün kaldı');
  });

  it('saati açıklanmamış maçta yalnız gün; geri sayım yoksa boş', () => {
    expect(countdownLabel({ kind: 'today', days: 0 }, null, t)).toBe('Bugün');
    expect(countdownLabel({ kind: 'tomorrow', days: 1 }, null, t)).toBe('Yarın');
    expect(countdownLabel(null, '20:00', t)).toBe('');
  });
});
