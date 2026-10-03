import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { isFirstLegOf, isSecondLeg, parseScorePair, pickFirstLeg, tieSummary } from './aggregateScore';

const GS = { id: 34, name: 'Galatasaray' };
const JUV = { id: 625, name: 'Juventus' };

const m = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'NOT STARTED', time: '', date: '2026-02-24', home: GS, away: JUV, competition: { id: 2, name: 'UCL' }, ...over }) as Match;

// 1. ayak: Juventus (ev) 2–1 Galatasaray; 2. ayak: Galatasaray (ev) – Juventus.
const firstLeg = m({ id: 10, leg: '1/2', date: '2026-02-17', status: 'FINISHED', home: JUV, away: GS, scores: { score: '2-1' } });

describe('aggregateScore', () => {
  it('skor ayrıştırma ve 2. ayak tespiti', () => {
    expect(parseScorePair('2-1')).toEqual([2, 1]);
    expect(parseScorePair(' 3 – 0 ')).toEqual([3, 0]);
    expect(parseScorePair('-')).toBeNull();
    expect(isSecondLeg(m({ leg: '2/2' }))).toBe(true);
    expect(isSecondLeg(m({ leg: '1/2' }))).toBe(false);
    expect(isSecondLeg(m({}))).toBe(false);
  });

  it('1. ayak seçimi: aynı turnuva, ev / deplasman ters, "1/2", önceki tarih; en yakın olan', () => {
    const second = m({ leg: '2/2' });
    const older = { ...firstLeg, id: 9, date: '2025-02-17' };
    const otherComp = { ...firstLeg, id: 11, competition: { id: 600, name: 'SL' } };
    const sameSide = { ...firstLeg, id: 12, home: GS, away: JUV };
    expect(isFirstLegOf(second, firstLeg)).toBe(true);
    expect(isFirstLegOf(second, otherComp)).toBe(false);
    expect(isFirstLegOf(second, sameSide)).toBe(false);
    expect(pickFirstLeg(second, [older, otherComp, firstLeg, sameSide])?.id).toBe(10);
    expect(pickFirstLeg(second, [])).toBeNull();
  });

  it('aggregate yok — 2. ayak başlamadı: toplam = 1. ayak (bu maçın ev sahibine göre çevrilmiş)', () => {
    expect(tieSummary(m({ leg: '2/2' }), firstLeg)).toEqual({ home: 1, away: 2, winner: null });
  });

  it('aggregate yok — 2. ayak canlı: 1. ayak + güncel skor, kazanan yok', () => {
    expect(tieSummary(m({ leg: '2/2', status: 'IN PLAY', scores: { score: '2-0' } }), firstLeg)).toEqual({ home: 3, away: 2, winner: null });
  });

  it('uzatma dahil (CURRENT), penaltı hariç; penaltılı bitişte kazanan penaltıdan', () => {
    const fin = m({ leg: '2/2', status: 'FINISHED', scores: { score: '2-1', et_score: '2-1', ps_score: '4-3' } });
    expect(tieSummary(fin, firstLeg)).toEqual({ home: 3, away: 3, penalties: { home: 4, away: 3 }, winner: 'home' });
  });

  it('Sportmonks aggregate varsa o kullanılır (istek yok); kazanan winner_id\'den', () => {
    const fin = m({ leg: '2/2', status: 'FINISHED', scores: { score: '5-3' }, aggregate: { home: 5, away: 7, winner_id: JUV.id } });
    expect(tieSummary(fin, null)).toEqual({ home: 5, away: 7, winner: 'away' });
    // Bitmemişse kazanan yok
    expect(tieSummary({ ...fin, status: 'IN PLAY' }, null)?.winner).toBeNull();
  });

  it('2. ayak değilse ya da 1. ayak bilinmiyorsa null', () => {
    expect(tieSummary(m({ leg: '1/2' }), firstLeg)).toBeNull();
    expect(tieSummary(m({ leg: '2/2' }), null)).toBeNull();
    expect(tieSummary(m({ leg: '2/2' }), { ...firstLeg, scores: undefined, score: undefined })).toBeNull();
  });
});
