import { describe, expect, it } from 'vitest';
import tur_ita from './__fixtures__/fixtureNationsLeagueTurIta_1528905.json';
import tur_hun from './__fixtures__/fixtureNationsLeagueTurHun_1316553.json';
import ucl from './__fixtures__/fixtureUclFinal_1374812.json';
import gsts from './__fixtures__/fixtureSuperLigGsTs_1237986.json';
import cupPen from './__fixtures__/fixtureTurkishCupR4Pen_1315108.json';
import cupFinal from './__fixtures__/fixtureTurkishCupFinal_1373028.json';
import { AF_ID_OFFSET, isNationalMatchId, toAfId, toAppId } from './ids';
import { mapNationalFixture, mapNationalEvents, mapNationalLineups, mapNationalMatch, mapNationalStats } from './mapper';
import type { AfFixture } from './types';

const fx = (j: unknown) => (j as { response: AfFixture[] }).response[0]!;

describe('kimlik uzayı', () => {
  it('AF id + 2e9; geri çevrilebilir; Sportmonks / eski id\'ler milli sayılmaz', () => {
    expect(toAppId(1528905)).toBe(2_001_528_905);
    expect(toAfId('2001528905')).toBe(1528905);
    expect(isNationalMatchId('2001528905')).toBe(true);
    expect(isNationalMatchId('19746621')).toBe(false); // Sportmonks
    expect(isNationalMatchId('1058753')).toBe(false); // eski belirsiz bölge
    expect(isNationalMatchId(AF_ID_OFFSET - 1)).toBe(false);
    expect(isNationalMatchId('2147483648')).toBe(false); // int4 dışı
    expect(isNationalMatchId('abc')).toBe(false);
    expect(isNationalMatchId(null)).toBe(false);
  });
});

describe('Türkiye 1-4 İtalya (UNL)', () => {
  const b = mapNationalFixture(fx(tur_ita));
  it('maç özeti: kaymış id\'ler, skor, durum, stadyum, hakem, TD', () => {
    expect(b.match.id).toBe(toAppId(1528905));
    expect(b.match.home.id).toBe(toAppId(777));
    expect(b.match.home.name).toBe('Türkiye');
    expect(b.match.competition?.id).toBe(toAppId(5));
    expect(b.match.status).toBe('FINISHED');
    expect(b.match.scores).toMatchObject({ score: '1-4', ht_score: '0-3' });
    expect(b.match.date).toBe('2026-09-28');
    expect(b.match.scheduled).toBe('18:45');
    expect(b.match.location).toBe('Bursa Büyükşehir Stadyumu, Bursa');
    expect(b.match.referee).toBe('Michael Oliver');
    expect(b.match.coaches?.home).toBe('V. Montella');
    expect(b.match.finish).toBeUndefined();
  });
  it('olmayan alanlar eklenmez (hava, TV, hakem id, hashtag, forma rengi)', () => {
    for (const k of ['weather', 'tv_stations', 'referee_id', 'hashtag', 'aggregate'] as const) expect(b.match[k]).toBeUndefined();
  });
  it('istatistik: "H:A" biçimi, xG yok', () => {
    expect(b.stats).not.toBeNull();
    expect(b.stats!.shots_on_target).toBe('3:' + b.stats!.shots_on_target!.split(':')[1]);
    expect(b.stats!.corners).toMatch(/^6:\d+$/);
    expect(b.stats!.possesion).toMatch(/^\d+:\d+$/);
    expect(b.stats).not.toHaveProperty('expected_goals');
  });
  it('olaylar: dakikaya göre sıralı, id\'ler kaymış, ev/deplasman doğru', () => {
    expect(b.events.length).toBeGreaterThan(5);
    const times = b.events.map((e) => e.time);
    expect([...times].sort((a, c) => a - c)).toEqual(times);
    const first = b.events[0]!;
    expect(first.event).toBe('GOAL');
    expect(first.is_away).toBe(true);
    expect(first.player.id).toBe(toAppId(31009));
    expect(new Set(b.events.map((e) => e.id)).size).toBe(b.events.length);
  });
  it('kadro: 11+yedek, id kaymış, kaleci GK', () => {
    const home = b.lineups!.lineup.home;
    expect(home.team.id).toBe(String(toAppId(777)));
    expect(home.players.filter((p) => p.substitution === '0')).toHaveLength(11);
    const gk = home.players.find((p) => p.shirt_number === '1')!;
    expect(gk.position).toBe('GK');
    expect(gk.id).toBe(String(toAppId(50132)));
    expect(b.lineups!.confirmed).toBe(true);
  });
});

describe('oyuncu değişikliği yönü', () => {
  it('AF player=çıkan/assist=giren → player=giren, related_player=çıkan', () => {
    const f = fx(cupPen);
    const raw = f.events!.find((e) => e.type === 'subst')!;
    const mapped = mapNationalEvents(f).find((e) => e.event === 'SUBSTITUTION' && e.related_player?.name === raw.player.name);
    expect(mapped?.player.name).toBe(raw.assist.name);
    expect(mapped?.related_player?.id).toBe(toAppId(raw.player.id!));
  });
});

describe('kadro ızgarası aynalama', () => {
  it('sütun 1 (AF sol) → satırda son sütun', () => {
    const f = fx(ucl);
    const l = mapNationalLineups(f)!;
    const raw = f.lineups![0]!.startXI!;
    const d4 = raw.filter((p) => p.player.grid?.startsWith('2:')); // 4'lü savunma: sütun 1..4
    expect(d4).toHaveLength(4);
    const col1 = d4.find((p) => p.player.grid === '2:1')!;
    const mapped = l.lineup.home.players.find((p) => p.id === String(toAppId(col1.player.id!)))!;
    expect(mapped.formation_row).toBe(2);
    expect(mapped.formation_col).toBe(4);
    const gk = l.lineup.home.players.find((p) => p.position === 'GK' && p.substitution === '0')!;
    expect(gk.formation_row).toBe(1);
    expect(gk.formation_col).toBe(1); // tek kişilik satır aynalanınca aynı
  });
});

describe('seri penaltı (alt tur)', () => {
  const f = fx(cupPen);
  const m = mapNationalMatch(f);
  const ev = mapNationalEvents(f);
  it('PEN + ps_score + goals ile ana skor', () => {
    expect(m.finish).toBe('PEN');
    expect(m.scores?.ps_score).toBe('6-7');
    expect(m.scores?.score).toBe(`${f.goals.home}-${f.goals.away}`);
  });
  it('bozuk tekrarlı satırlar tekilleştirilir, atışlar SHOOTOUT olur', () => {
    const shootout = ev.filter((e) => e.event.startsWith('PENALTY_SHOOTOUT'));
    expect(shootout.length).toBeGreaterThan(0);
    expect(shootout.length).toBeLessThan(25);
    const keys = shootout.map((e) => `${e.player.id}|${e.event}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ev.filter((e) => e.event === 'MISSED_PENALTY')).toHaveLength(0);
  });
});

describe('ek dakika ve sıra', () => {
  it('90+8 / 90+10 sırasız gelse de sıralı; dakika = süre + ek', () => {
    const ev = mapNationalEvents(fx(gsts));
    const times = ev.map((e) => e.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(times).toContain(98);
    expect(times).toContain(100);
    expect(ev.find((e) => e.event === 'OWN_GOAL')).toBeDefined();
    expect(ev.find((e) => e.event === 'VAR')?.addition).toBe('Penalty confirmed');
  });
});

describe('eksik veri', () => {
  it('kadrosu formasyonsuz kupa finali: kadro var ama ızgara yok; istatistik yok → null', () => {
    const f = fx(cupFinal);
    const l = mapNationalLineups(f);
    expect(l?.lineup.home.players.every((p) => p.formation_row === undefined)).toBe(true);
    expect(mapNationalStats({ ...f, statistics: [] })).toBeNull();
    expect(mapNationalLineups({ ...f, lineups: [] })).toBeNull();
  });
  it('başlamamış maçta skor yok; TBD/PST durum kodları', () => {
    const f = fx(tur_hun);
    const ns = mapNationalMatch({ ...f, fixture: { ...f.fixture, status: { short: 'NS' } } });
    expect(ns.status).toBe('NOT STARTED');
    expect(ns.scores).toBeUndefined();
    expect(mapNationalMatch({ ...f, fixture: { ...f.fixture, status: { short: 'PST' } } }).state_code).toBe('POSTPONED');
    const live = mapNationalMatch({ ...f, fixture: { ...f.fixture, status: { short: '2H', elapsed: 67 } } });
    expect(live.status).toBe('IN PLAY');
    expect(live.time).toBe("67'");
  });
});
