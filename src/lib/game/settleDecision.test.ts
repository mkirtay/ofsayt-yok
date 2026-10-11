import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { decideMatch, needsProviderCheck } from './settleDecision';

const K = new Date('2026-10-17T16:00:00Z'); // Cumartesi 19:00 TSİ
const base = { kickoffAt: K, weekStartsAt: new Date('2026-10-11T21:00:00Z'), weekEndsAt: new Date('2026-10-18T21:00:00Z'), checkedAt: null };
const at = (iso: string) => new Date(iso);
const m = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'NOT STARTED', time: '', date: '2026-10-17', scheduled: '16:00', home: { name: 'A' }, away: { name: 'B' }, ...over }) as Match;

describe('settle kararı', () => {
  it('bitti: normal süre skoru (ft_score), uzatmalı skor değil', () => {
    expect(decideMatch({ ...base, now: at('2026-10-17T18:00:00Z') }, m({ status: 'FINISHED', scores: { score: '3-2', ft_score: '2-2' } }))).toEqual({ kind: 'finish', home: 2, away: 2 });
    expect(decideMatch({ ...base, now: at('2026-10-17T18:00:00Z') }, m({ status: 'FINISHED', scores: { score: '1-0' } }))).toEqual({ kind: 'finish', home: 1, away: 0 });
  });

  it('iptal / hükmen / yarıda kaldı → VOID', () => {
    for (const code of ['CANCELLED', 'AWARDED', 'ABANDONED', 'WALKOVER', 'DELETED'] as const) {
      expect(decideMatch({ ...base, now: at('2026-10-17T18:00:00Z') }, m({ status: 'FINISHED', state_code: code, scores: { score: '3-0' } }))).toEqual({ kind: 'void', reason: code });
    }
  });

  it('canlı ama bizde gelecekte → erken kilit; zaten başlamışsa bir şey yapma', () => {
    const now = at('2026-10-17T15:50:00Z');
    expect(decideMatch({ ...base, now }, m({ status: 'IN PLAY' }))).toEqual({ kind: 'kickoff', at: now });
    expect(decideMatch({ ...base, now: at('2026-10-17T16:30:00Z') }, m({ status: 'IN PLAY' }))).toEqual({ kind: 'none' });
  });

  it('saat değişti (hafta içi) → kickoff güncelle; hafta dışına → VOID', () => {
    const now = at('2026-10-17T14:00:00Z');
    expect(decideMatch({ ...base, now }, m({ date: '2026-10-18', scheduled: '17:00' }))).toEqual({ kind: 'kickoff', at: at('2026-10-18T17:00:00Z') });
    expect(decideMatch({ ...base, now }, m({ date: '2026-10-21', scheduled: '17:00', state_code: 'POSTPONED' }))).toEqual({ kind: 'void', reason: 'MOVED_OUT' });
    // Pazar 23:59 TSİ sınırı: 18 Ekim 21:00 UTC = Pazartesi 00:00 TSİ → hafta dışı
    expect(decideMatch({ ...base, now }, m({ date: '2026-10-18', scheduled: '21:00' }))).toEqual({ kind: 'void', reason: 'MOVED_OUT' });
  });

  it('başlamış (bizde kilitli) maçın saati ileri alınmaz; erkene çekilirse şimdiye kilitlenir', () => {
    const now = at('2026-10-17T16:10:00Z');
    expect(decideMatch({ ...base, now }, m({ date: '2026-10-17', scheduled: '18:00' }))).toEqual({ kind: 'none' });
    expect(decideMatch({ ...base, now: at('2026-10-17T15:00:00Z') }, m({ date: '2026-10-17', scheduled: '14:00' }))).toEqual({ kind: 'kickoff', at: at('2026-10-17T15:00:00Z') });
  });

  it('başlama saati açıklanmamış (TBA) → saati değiştirme', () => {
    expect(decideMatch({ ...base, now: at('2026-10-16T10:00:00Z') }, m({ date: '2026-10-17', scheduled: '00:00', time_tbd: true }))).toEqual({ kind: 'none' });
  });

  it('sağlayıcıda yok: +4 sa yedek (saatte bir), +3 gün VOID', () => {
    expect(decideMatch({ ...base, now: at('2026-10-17T19:00:00Z') }, null)).toEqual({ kind: 'none' });
    expect(decideMatch({ ...base, now: at('2026-10-17T20:30:00Z') }, null)).toEqual({ kind: 'fallback' });
    expect(decideMatch({ ...base, checkedAt: at('2026-10-17T20:00:00Z'), now: at('2026-10-17T20:30:00Z') }, null)).toEqual({ kind: 'none' });
    expect(decideMatch({ ...base, now: at('2026-10-17T20:30:00Z') }, null, true)).toEqual({ kind: 'none' });
    expect(decideMatch({ ...base, now: at('2026-10-20T17:00:00Z') }, null)).toEqual({ kind: 'void', reason: 'UNRESOLVED' });
  });

  it('bitti görünüyor ama skor yok → bekle', () => {
    expect(decideMatch({ ...base, now: at('2026-10-17T18:00:00Z') }, m({ status: 'FINISHED' }))).toEqual({ kind: 'none' });
  });

  it('gün listesine yalnız başlamaya 3 sa kala ve sonrası bakılır', () => {
    expect(needsProviderCheck(K, at('2026-10-17T12:00:00Z'))).toBe(false);
    expect(needsProviderCheck(K, at('2026-10-17T13:00:00Z'))).toBe(true);
    expect(needsProviderCheck(K, at('2026-10-18T13:00:00Z'))).toBe(true);
  });
});
