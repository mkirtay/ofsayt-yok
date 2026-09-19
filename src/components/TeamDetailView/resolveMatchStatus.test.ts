import { describe, expect, it } from 'vitest';
import { resolveMatchStatus } from './index';

const m = (o: object) => o as never;

describe('resolveMatchStatus — dar panel sütunu için kısa etiketler', () => {
  it('Sportmonks tam durum adları kısaltılır', () => {
    expect(resolveMatchStatus(m({ status: 'FINISHED' }))).toBe('MS');
    expect(resolveMatchStatus(m({ status: 'HALF TIME BREAK' }))).toBe('İY');
    expect(resolveMatchStatus(m({ status: 'IN PLAY', time: "32'" }))).toBe("32'");
    expect(resolveMatchStatus(m({ status: 'IN PLAY' }))).toBe('CANLI');
  });
  it('eski kısa kodlar hâlâ çalışır', () => {
    expect(resolveMatchStatus(m({ status: 'FT' }))).toBe('MS');
    expect(resolveMatchStatus(m({ status: 'HT' }))).toBe('İY');
  });
});
