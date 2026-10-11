import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import type { LiveMatchPatch } from '@/server/liveMatch';
import { applyLivePatchToLists, applyLivePatchToMatch, isLivePatchBehind, parseMatchMinute, type HomeMatchLists } from './liveMatchPatch';

const match = (over: Partial<Match> = {}): Match =>
  ({ id: 19746594, status: 'IN PLAY', time: "74'", scores: { score: '1-0' }, home: { id: 1 }, away: { id: 2 }, ...over }) as Match;
const patch = (over: Partial<LiveMatchPatch> = {}): LiveMatchPatch => ({
  id: 19746594,
  status: 'IN PLAY',
  time: "75'",
  scores: { score: '1-1' },
  ...over,
});

describe('parseMatchMinute', () => {
  it('dakika ve uzatma dakikası; okunamazsa null', () => {
    expect(parseMatchMinute("74'")).toBe(74);
    expect(parseMatchMinute("45+2'")).toBeCloseTo(45.02);
    expect(parseMatchMinute('90 + 3')).toBeCloseTo(90.03);
    expect(parseMatchMinute('')).toBeNull();
    expect(parseMatchMinute(undefined)).toBeNull();
  });
});

describe('isLivePatchBehind (monoton koruma)', () => {
  it('evre geri gidemez: bitmiş maç canlıya, canlı maç başlamadıya dönmez', () => {
    expect(isLivePatchBehind(match({ status: 'FINISHED', time: '' }), patch({ status: 'IN PLAY' }))).toBe(true);
    expect(isLivePatchBehind(match({ status: 'FINISHED' }), patch({ status: 'HALF TIME BREAK' }))).toBe(true);
    expect(isLivePatchBehind(match({ status: 'IN PLAY' }), patch({ status: 'NOT STARTED', time: '' }))).toBe(true);
  });

  it('evre ilerlemesi yeni sayılır (gol ya da dakika ne olursa olsun)', () => {
    expect(isLivePatchBehind(match({ status: 'NOT STARTED', time: '', scores: { score: '0-0' } }), patch({ time: "1'" }))).toBe(false);
    expect(isLivePatchBehind(match({ status: 'IN PLAY', time: "90+4'" }), patch({ status: 'FINISHED', time: '' }))).toBe(false);
  });

  it('toplam gol geri gidemez; artış dakika geride görünse de yeni', () => {
    expect(isLivePatchBehind(match({ scores: { score: '1-1' } }), patch({ scores: { score: '1-0' }, time: "80'" }))).toBe(true);
    expect(isLivePatchBehind(match({ scores: { score: '1-0' }, time: "76'" }), patch({ scores: { score: '1-1' }, time: "75'" }))).toBe(false);
  });

  it('aynı evre ve gol sayısında dakika geri gidemez; okunamayan dakika engellemez', () => {
    expect(isLivePatchBehind(match({ scores: { score: '1-1' }, time: "76'" }), patch({ time: "75'" }))).toBe(true);
    expect(isLivePatchBehind(match({ scores: { score: '1-1' }, time: "45+3'" }), patch({ time: "45+1'" }))).toBe(true);
    expect(isLivePatchBehind(match({ scores: { score: '1-1' }, time: "75'" }), patch({ time: "75'" }))).toBe(false);
    expect(isLivePatchBehind(match({ status: 'HALF TIME BREAK', time: '', scores: { score: '1-1' } }), patch({ time: "46'" }))).toBe(false);
  });
});

describe('applyLivePatchToMatch', () => {
  it('gol: skor, dakika ve durum yazılır; diğer alanlar korunur', () => {
    const current = match({ competition: { id: 600, name: 'Super Lig' } });
    const next = applyLivePatchToMatch(current, patch());
    expect(next).not.toBe(current);
    expect(next.scores).toEqual({ score: '1-1' });
    expect(next.time).toBe("75'");
    expect(next.competition).toEqual({ id: 600, name: 'Super Lig' });
  });

  it('geride kalan yama aynı nesneyi döner (yeni skor eskiyle ezilmez)', () => {
    const current = match({ scores: { score: '1-1' }, time: "76'" });
    expect(applyLivePatchToMatch(current, patch({ scores: { score: '1-0' }, time: "77'" }))).toBe(current);
    const finished = match({ status: 'FINISHED', time: '', scores: { score: '2-1' } });
    expect(applyLivePatchToMatch(finished, patch({ status: 'IN PLAY', scores: { score: '2-1' }, time: "90'" }))).toBe(finished);
  });

  it('yalnız dakika ilerlediyse yazılmaz (listenin yenileme sayacını sıfırlamasın)', () => {
    const current = match({ scores: { score: '1-1' } });
    expect(applyLivePatchToMatch(current, patch({ time: "80'" }))).toBe(current);
  });

  it('bitiş: durum, uzatma/penaltı bitişi yazılır; kalkan özel durum silinir', () => {
    const current = match({ state_code: 'INTERRUPTED', scores: { score: '1-1' } });
    const next = applyLivePatchToMatch(current, patch({ status: 'FINISHED', time: '', finish: 'PEN', scores: { score: '1-1', ps_score: '4-3' } }));
    expect(next.status).toBe('FINISHED');
    expect(next.finish).toBe('PEN');
    expect(next.scores?.ps_score).toBe('4-3');
    expect('state_code' in next).toBe(false);
  });

  it('yamada skor yoksa listedeki skor korunur; başka maça dokunmaz', () => {
    const current = match({ status: 'IN PLAY', scores: { score: '1-0' } });
    const next = applyLivePatchToMatch(current, { id: 19746594, status: 'HALF TIME BREAK', time: '' });
    expect(next.status).toBe('HALF TIME BREAK');
    expect(next.scores).toEqual({ score: '1-0' });
    const other = match({ id: 1 });
    expect(applyLivePatchToMatch(other, patch())).toBe(other);
  });
});

describe('applyLivePatchToLists', () => {
  const lists = (): HomeMatchLists & { stale: boolean } => ({
    allMatches: [match({ id: 5 }), match()],
    liveMatches: [match()],
    fixtureMatches: [match()],
    nightMatches: [],
    stale: false,
  });

  it('maç hangi dizideyse hepsinde yamalanır; diğer satırlar ve alanlar aynı referans', () => {
    const data = lists();
    const next = applyLivePatchToLists(data, patch());
    expect(next).not.toBe(data);
    expect(next.allMatches[0]).toBe(data.allMatches[0]);
    expect(next.allMatches[1]!.scores?.score).toBe('1-1');
    expect(next.liveMatches[0]!.scores?.score).toBe('1-1');
    expect(next.fixtureMatches[0]!.scores?.score).toBe('1-1');
    expect(next.nightMatches).toBe(data.nightMatches);
    expect(next.stale).toBe(false);
  });

  it('değişiklik yoksa ya da yama gerideyse aynı nesne', () => {
    const data = lists();
    expect(applyLivePatchToLists(data, patch({ scores: { score: '1-0' }, time: "74'" }))).toBe(data);
    expect(applyLivePatchToLists(data, patch({ status: 'NOT STARTED', scores: { score: '0-0' } }))).toBe(data);
    expect(applyLivePatchToLists(data, patch({ id: 999 }))).toBe(data);
  });
});
