import { describe, it, expect } from 'vitest';
import { hasActiveMatch, homePollDelayMs, matchListFreshSeconds, matchKickoffMs } from './matchActivity';

const NOW = Date.parse('2026-09-30T13:00:00Z');
const ns = (hhmm: string, date = '2026-09-30') => ({ status: 'NOT STARTED', date, scheduled: hhmm });

describe('matchActivity', () => {
  it('başlama saati: date + scheduled (UTC)', () => {
    expect(matchKickoffMs(ns('19:00'))).toBe(Date.parse('2026-09-30T19:00:00Z'));
    expect(matchKickoffMs({ status: 'NOT STARTED', date: '2026-09-30' })).toBeNull();
  });

  it('aktif: canlı / devre arası / ±15 dk içinde başlama / başlama saati geçmiş ama hâlâ NS (≤3 sa)', () => {
    expect(hasActiveMatch([{ status: 'IN PLAY' }], NOW)).toBe(true);
    expect(hasActiveMatch([{ status: 'HALF TIME BREAK' }], NOW)).toBe(true);
    expect(hasActiveMatch([ns('13:10')], NOW)).toBe(true);
    expect(hasActiveMatch([ns('12:50')], NOW)).toBe(true);
    expect(hasActiveMatch([ns('11:00')], NOW)).toBe(true);
    expect(hasActiveMatch([ns('08:00')], NOW)).toBe(false); // ertelenmiş, 5 sa önce
    expect(hasActiveMatch([ns('13:30'), { status: 'FINISHED', date: '2026-09-30', scheduled: '10:00' }], NOW)).toBe(false);
  });

  it('polling: aktif 30 sn, değilse 5 dk; hatada üstel bekleme (en çok 5 dk)', () => {
    expect(homePollDelayMs([{ status: 'IN PLAY' }], 0, NOW)).toBe(30_000);
    expect(homePollDelayMs([ns('19:00')], 0, NOW)).toBe(300_000);
    expect(homePollDelayMs([], 0, NOW)).toBe(300_000);
    expect(homePollDelayMs([{ status: 'IN PLAY' }], 1, NOW)).toBe(60_000);
    expect(homePollDelayMs([{ status: 'IN PLAY' }], 2, NOW)).toBe(120_000);
    expect(homePollDelayMs([{ status: 'IN PLAY' }], 6, NOW)).toBe(300_000);
  });

  it('liste tazeliği: aktif 30, aksi halde sıradaki başlama −15 dk (sınırlı)', () => {
    expect(matchListFreshSeconds([{ status: 'IN PLAY' }], 300, NOW)).toBe(30);
    expect(matchListFreshSeconds([ns('13:10')], 300, NOW)).toBe(30);
    expect(matchListFreshSeconds([ns('13:16')], 300, NOW)).toBe(60);
    expect(matchListFreshSeconds([ns('13:18')], 300, NOW)).toBe(180);
    expect(matchListFreshSeconds([ns('19:00')], 300, NOW)).toBe(300);
    expect(matchListFreshSeconds([], 900, NOW)).toBe(900);
  });
});
