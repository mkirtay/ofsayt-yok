import { describe, expect, it } from 'vitest';
import {
  ageOn,
  formatTransferFee,
  isYouthTeamName,
  mapTeamTransfers,
  transferKind,
  type SportmonksTeamTransferRow,
} from './teamTransfers';
import gs from './__fixtures__/transfers.gs-2026-10-21.json';
import fb from './__fixtures__/transfers.fb-2026-10-21.json';
import bjk from './__fixtures__/transfers.bjk-2026-10-21.json';

const TODAY = '2026-10-21';
const names = (list: { playerName: string }[]) => list.map((t) => t.playerName);

describe('transferKind (Sportmonks core/types)', () => {
  it('218 kiralık, 219 bonservisli, 220 serbest, 9688 kiralık dönüşü; diğerleri yok', () => {
    expect(transferKind(218)).toBe('loan');
    expect(transferKind(219)).toBe('permanent');
    expect(transferKind(220)).toBe('free');
    expect(transferKind(9688)).toBe('loanReturn');
    expect(transferKind(1)).toBeNull();
    expect(transferKind(null)).toBeNull();
  });
});

describe('isYouthTeamName / ageOn', () => {
  it('altyapı / rezerv takımı adları', () => {
    for (const n of ['Beşiktaş U19', 'Borussia Mönchengladbach U19', 'Real Madrid Castilla II', 'Barcelona B', 'Jong Ajax', 'Liverpool Reserves', 'Inter Primavera', 'Flamengo Sub-20', 'Chelsea U-21']) {
      expect(isYouthTeamName(n), n).toBe(true);
    }
    for (const n of ['Galatasaray', 'Bayer 04 Leverkusen', 'Club Brugge', 'Esenler Erokspor', 'AZ', 'Bodrum FK']) {
      expect(isYouthTeamName(n), n).toBe(false);
    }
  });

  it('tam yaş, doğum gününden önce bir eksik', () => {
    expect(ageOn('2004-02-10', '2025-02-09')).toBe(20);
    expect(ageOn('2004-02-10', '2025-02-10')).toBe(21);
    expect(ageOn(null, '2025-02-10')).toBeNull();
  });
});

describe('mapTeamTransfers — gerçek veri (2026-10-21)', () => {
  it('GS (2 sayfa): pencere + gürültü süzgeci → 21 satır; altyapı kiralıkları ve U19 alımı yok', () => {
    const out = mapTeamTransfers(gs as SportmonksTeamTransferRow[], 34, TODAY);
    expect(out.incoming.length + out.outgoing.length).toBe(21);
    expect(names(out.incoming)).toEqual(expect.arrayContaining(['Deniz Gül', 'Aleksey Batrakov', 'El Chadaille Bitshiabu', 'Lesley Ugochukwu', 'Renato Nhaga']));
    expect(names(out.outgoing)).toEqual(expect.arrayContaining(['Elias Jelert', 'Metehan Baltacı', 'Umut Erdem']));
    const all = [...names(out.incoming), ...names(out.outgoing)];
    for (const youth of ['Berat Yılmaz', 'Yalın Dilek', 'Ali Yeşilyurt', 'Berat Luş', 'Armando Güner']) expect(all).not.toContain(youth);
    // Yeniden eskiye; planlanan (gelecek tarihli) kiralık dönüşü yok.
    expect(out.incoming[0]).toMatchObject({ playerName: 'El Chadaille Bitshiabu', kind: 'loan', date: '2026-09-02', club: { name: 'RB Leipzig' } });
    expect(out.incoming.every((t) => t.date <= TODAY && t.date >= '2025-10-21')).toBe(true);
    // Bedel yalnız varsa.
    expect(out.incoming.find((t) => t.playerName === 'Aleksey Batrakov')).toMatchObject({ kind: 'permanent', fee: 25_000_000 });
    expect(out.incoming.find((t) => t.playerName === 'El Chadaille Bitshiabu')?.fee).toBeUndefined();
  });

  it('FB: 17 satır; alt lig kiralıkları ve 19 yaş serbest ayrılış yok, TBC karşı takım gizli', () => {
    const out = mapTeamTransfers(fb as SportmonksTeamTransferRow[], 88, TODAY);
    expect(out.incoming.length + out.outgoing.length).toBe(17);
    const all = [...names(out.incoming), ...names(out.outgoing)];
    for (const youth of ['Çağrı Fedai', 'Engin Biterge', 'Yiğit Fidan']) expect(all).not.toContain(youth);
    expect(out.outgoing.find((t) => t.playerName === 'Sidiki Chérif' && t.kind === 'permanent')).toMatchObject({ fee: 24_500_000 });
    const diouf = out.incoming.find((t) => t.playerName === 'Amara Diouf');
    expect(diouf).toBeDefined();
    expect(diouf?.club).toBeUndefined();
  });

  it('BJK: 20 satır; U19\'dan A takıma geçenler ve genç yurt içi kiralıklar yok, yabancı kiralıklar var', () => {
    const out = mapTeamTransfers(bjk as SportmonksTeamTransferRow[], 554, TODAY);
    expect(out.incoming.length + out.outgoing.length).toBe(20);
    const all = [...names(out.incoming), ...names(out.outgoing)];
    for (const youth of ['Ozan Sevim', 'Azem Yortaç', 'Devrim Şahin', 'Fahri Kerem Ay']) expect(all).not.toContain(youth);
    expect(names(out.incoming)).toEqual(expect.arrayContaining(['Fabio Miretti', 'Ernest Poku', 'Ümit Akdağ']));
  });
});

describe('mapTeamTransfers — kurallar', () => {
  const own = { id: 1, country_id: 404, name: 'Takım' };
  const dom = { id: 2, country_id: 404, name: 'Yurt İçi' };
  const abroad = { id: 3, country_id: 11, name: 'Yurt Dışı' };
  const row = (over: Partial<SportmonksTeamTransferRow>): SportmonksTeamTransferRow => ({
    id: Math.floor(Math.random() * 1e9),
    type_id: 218,
    from_team_id: 1,
    to_team_id: 2,
    date: '2026-08-01',
    player: { id: 9, display_name: 'Oyuncu', date_of_birth: '2005-01-01' },
    fromteam: own,
    toteam: dom,
    ...over,
  });

  it('genç (≤21) bedelsiz yurt içi kiralık atılır; 22 yaş, yurt dışı ya da bedelli kalır', () => {
    expect(mapTeamTransfers([row({})], 1, TODAY).outgoing).toHaveLength(0);
    expect(mapTeamTransfers([row({ player: { id: 9, display_name: 'O', date_of_birth: '2003-01-01' } })], 1, TODAY).outgoing).toHaveLength(1);
    expect(mapTeamTransfers([row({ toteam: abroad, to_team_id: 3 })], 1, TODAY).outgoing).toHaveLength(1);
    expect(mapTeamTransfers([row({ amount: 500_000 })], 1, TODAY).outgoing).toHaveLength(1);
    expect(mapTeamTransfers([row({ type_id: 219 })], 1, TODAY).outgoing).toHaveLength(1);
  });

  it('doğum tarihi yoksa yaş kuralı uygulanmaz; tekil id; ilgisiz / tanınmayan tür / 12 aydan eski / gelecek tarih atılır', () => {
    const noDob = row({ id: 5, player: { id: 9, display_name: 'O' } });
    expect(mapTeamTransfers([noDob, noDob], 1, TODAY).outgoing).toHaveLength(1);
    expect(mapTeamTransfers([row({ from_team_id: 7 })], 1, TODAY).outgoing).toHaveLength(0);
    expect(mapTeamTransfers([row({ type_id: 1, toteam: abroad })], 1, TODAY).outgoing).toHaveLength(0);
    expect(mapTeamTransfers([row({ date: '2025-10-20', toteam: abroad })], 1, TODAY).outgoing).toHaveLength(0);
    expect(mapTeamTransfers([row({ date: '2027-06-30', toteam: abroad })], 1, TODAY).outgoing).toHaveLength(0);
  });
});

describe('formatTransferFee', () => {
  it('milyon / bin kısaltması, TR ve EN', () => {
    expect(formatTransferFee(25_000_000, 'tr')).toBe('€25 mn');
    expect(formatTransferFee(6_500_000, 'tr')).toBe('€6,5 mn');
    expect(formatTransferFee(350_000, 'tr')).toBe('€350 bin');
    expect(formatTransferFee(6_500_000, 'en')).toBe('€6.5M');
    expect(formatTransferFee(91_000, 'en')).toBe('€91K');
  });
});
