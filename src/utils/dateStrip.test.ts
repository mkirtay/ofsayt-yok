import { describe, expect, it } from 'vitest';
import { buildDateStrip, buildDateStripWithSelected, isoDayOfMonth, shiftIsoDate, todayIsoIstanbul } from './dateStrip';

describe('shiftIsoDate', () => {
  it('ay/yıl sınırlarını doğru geçer', () => {
    expect(shiftIsoDate('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftIsoDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftIsoDate('2028-02-28', 1)).toBe('2028-02-29'); // artık yıl
    expect(shiftIsoDate('2026-03-29', 1)).toBe('2026-03-30'); // DST haftası
  });
});

describe('buildDateStrip', () => {
  const strip = buildDateStrip('2026-09-19', '2026-09-19');
  it('bugünün ±2 günü: tam 5 öğe, sıralı', () => {
    expect(strip.map((s) => s.iso)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21']);
    expect(strip.map((s) => s.offset)).toEqual([-2, -1, 0, 1, 2]);
  });
  it('yalnızca bugün işaretlenir ve seçili gün doğru', () => {
    expect(strip.filter((s) => s.isToday).map((s) => s.iso)).toEqual(['2026-09-19']);
    expect(strip.filter((s) => s.isSelected).map((s) => s.iso)).toEqual(['2026-09-19']);
    const other = buildDateStrip('2026-09-19', '2026-09-21');
    expect(other.filter((s) => s.isSelected).map((s) => s.iso)).toEqual(['2026-09-21']);
  });
  it('seçili gün şeridin dışındaysa hiçbiri seçili olmaz', () => {
    expect(buildDateStrip('2026-09-19', '2026-10-05').some((s) => s.isSelected)).toBe(false);
  });
  it('ay sonu geçişi ve haftanın günü', () => {
    const s = buildDateStrip('2026-09-30', '2026-09-30');
    expect(s.map((x) => x.day)).toEqual([28, 29, 30, 1, 2]);
    expect(s[2]!.weekday).toBe(3); // 30 Eylül 2026 Çarşamba
  });
});

describe('todayIsoIstanbul / rozet', () => {
  it('UTC gece yarısına yakın anı Türkiye gününe çevirir (UTC+3)', () => {
    expect(todayIsoIstanbul(new Date('2026-09-19T21:30:00Z'))).toBe('2026-09-20');
    expect(todayIsoIstanbul(new Date('2026-09-19T20:59:00Z'))).toBe('2026-09-19');
  });
  it('rozet günü sabit değil, verilen tarihten türetilir', () => {
    expect(isoDayOfMonth(todayIsoIstanbul(new Date('2026-09-19T10:00:00Z')))).toBe(19);
    expect(isoDayOfMonth(todayIsoIstanbul(new Date('2026-03-04T10:00:00Z')))).toBe(4);
  });
});

describe('buildDateStripWithSelected', () => {
  it('seçili gün şerit içindeyse aynen döner', () => {
    expect(buildDateStripWithSelected('2026-09-19', '2026-09-20')).toHaveLength(5);
  });
  it('dışarıdaki geçmiş gün başa, gelecek gün sona eklenir', () => {
    const past = buildDateStripWithSelected('2026-09-19', '2026-09-01');
    expect(past).toHaveLength(6);
    expect(past[0]).toMatchObject({ iso: '2026-09-01', isSelected: true });
    const future = buildDateStripWithSelected('2026-09-19', '2026-10-01');
    expect(future).toHaveLength(6);
    expect(future[5]).toMatchObject({ iso: '2026-10-01', isSelected: true });
  });
});
