import { describe, expect, it } from 'vitest';
import { CUP_BRACKET_TEMPLATES, slotOfStageName } from '@/config/cupBrackets';
import { buildCupBracket, type RawStage } from './buildCupBracket';
import uclSeason2526 from './__fixtures__/uclSeason2526.json';
import uclSeason2627 from './__fixtures__/uclSeason2627.json';
import turkishCupSeason2526 from './__fixtures__/turkishCupSeason2526.json';
import turkishCupSeason2627 from './__fixtures__/turkishCupSeason2627.json';

/**
 * Fixture'lar gerçek `stages/seasons/{id}` yanıtlarından küçültüldü (2026-10-21; ŞL 25/26 25580, ŞL 26/27 28155,
 * TK 25/26 26074, TK 26/27 28283; seçili aşamalar, gereksiz alanlar atıldı).
 */
const UCL = CUP_BRACKET_TEMPLATES[2]!;
const TK = CUP_BRACKET_TEMPLATES[606]!;
const stagesOf = (j: { data: unknown }) => structuredClone(j.data) as RawStage[];
const build = (leagueId: number, seasonId: number, stages: RawStage[], edges?: Parameters<typeof buildCupBracket>[0]['edges']) =>
  buildCupBracket({ leagueId, seasonId, stages, template: leagueId === 606 ? TK : UCL, edges })!;
const round = (b: ReturnType<typeof build>, key: string) => b.rounds.find((r) => r.key === key)!;
const names = (t: { home: { name: string } | null; away: { name: string } | null }) => `${t.home?.name} – ${t.away?.name}`;

describe('aşama adı → ağaç yuvası', () => {
  it('sezonlar arası ad farkları', () => {
    expect(slotOfStageName('Final')).toBe('final');
    expect(slotOfStageName('Semi-finals')).toBe('sf');
    expect(slotOfStageName('Quarter-finals')).toBe('qf');
    expect(slotOfStageName('8th Finals')).toBe('r16');
    expect(slotOfStageName('Round of 16')).toBe('r16');
    expect(slotOfStageName('Knockout Round Play-offs')).toBe('ko_po');
    expect(slotOfStageName('Play-offs')).toBeNull();
    expect(slotOfStageName('3rd Round')).toBeNull();
  });
});

describe('Şampiyonlar Ligi 25/26 (iki ayak, tamamlanmış ağaç)', () => {
  const b = build(2, 25580, stagesOf(uclSeason2526));

  it('turlar şablon sırasıyla, hepsi bitti; lig aşaması puan durumu bağlantısı için', () => {
    expect(b.rounds.map((r) => [r.key, r.ties.length, r.status])).toEqual([
      ['ko_po', 8, 'done'],
      ['r16', 8, 'done'],
      ['qf', 4, 'done'],
      ['sf', 2, 'done'],
      ['final', 1, 'done'],
    ]);
    expect(b.leagueStage).toEqual({ stageId: 77478049, name: 'League Stage', kind: 'league' });
  });

  it('iki ayaklı toplam (uzatma dahil), kazanan aggregate’ten; 1. maçın ev sahibi önde', () => {
    const gs = round(b, 'ko_po').ties.find((t) => t.home?.name === 'Galatasaray')!;
    expect(names(gs)).toBe('Galatasaray – Juventus');
    expect(gs.legs.map((l) => [l.fixtureId, l.homeGoals, l.awayGoals])).toEqual([
      [19662553, 5, 2],
      [19662545, 3, 2],
    ]);
    expect(gs.agg).toEqual({ home: 7, away: 5, final: true });
    expect(gs.winnerId).toBe(34);
    expect(gs.decidedBy).toBe('et');
  });

  it('final tek maç, penaltıyla: PSG 1–1 (P 4–3) Arsenal', () => {
    const f = round(b, 'final').ties[0]!;
    expect(names(f)).toBe('Paris Saint Germain – Arsenal');
    expect(f.agg).toBeUndefined();
    expect(f.legs[0]).toMatchObject({ homeGoals: 1, awayGoals: 1, pens: { home: 4, away: 3 }, startingAt: '2026-05-30T16:00:00Z' });
    expect(f.pens).toEqual({ home: 4, away: 3 });
    expect(f.winnerId).toBe(591);
    expect(f.decidedBy).toBe('pen');
  });

  it('bağlantılar takım eşlemesiyle türetilir; dikey sıra finalden geriye (ebeveynin ev sahibi tarafı önce)', () => {
    const [sf1, sf2] = round(b, 'sf').ties;
    expect(names(sf1!)).toBe('Paris Saint Germain – FC Bayern München');
    expect(names(sf2!)).toBe('Atlético de Madrid – Arsenal');
    expect(round(b, 'qf').ties.map(names)).toEqual([
      'Paris Saint Germain – Liverpool',
      'Real Madrid – FC Bayern München',
      'FC Barcelona – Atlético de Madrid',
      'Sporting CP – Arsenal',
    ]);
    // Her tur bir sonrakine bağlı; yarıya inen turda 2k, 2k+1 → k; play-off → son 16 bire bir.
    const order = ['ko_po', 'r16', 'qf', 'sf', 'final'];
    for (let i = 0; i < order.length - 1; i++) {
      const cur = round(b, order[i]!).ties;
      const next = round(b, order[i + 1]!).ties;
      cur.forEach((t, r) => {
        const expected = next.length === cur.length ? next[r] : next[Math.floor(r / 2)];
        expect(t.nextTieId).toBe(expected!.id);
      });
    }
    expect(round(b, 'final').ties[0]!.nextTieId).toBeNull();
  });

  it('2. ayak oynanmadan (aggregate yok): aynı iki takımın x/2 maçları birleşir, ara toplam, kazanan yok, tur sürüyor', () => {
    const stages = stagesOf(uclSeason2526).filter((s) => s.name === 'Knockout Round Play-offs');
    const st = stages[0]!;
    st.aggregates = [];
    for (const f of st.fixtures!) {
      f.aggregate_id = null;
      if (f.leg === '2/2') {
        f.state_id = 1;
        f.scores = [];
        for (const p of f.participants!) p.meta = { ...p.meta, winner: null };
      }
    }
    const partial = build(2, 25580, stages);
    const gs = round(partial, 'ko_po').ties.find((t) => t.home?.name === 'Galatasaray')!;
    expect(gs.id).toBe('fx-19662553');
    expect(gs.legs).toHaveLength(2);
    expect(gs.legs[1]).toMatchObject({ homeGoals: null, awayGoals: null, stateId: 1 });
    expect(gs.agg).toEqual({ home: 5, away: 2, final: false });
    expect(gs.winnerId).toBeNull();
    expect(round(partial, 'ko_po').status).toBe('current');
    // Sonraki turların kurası yok → boş kutular, konuma göre bağlı.
    expect(round(partial, 'r16').status).toBe('tbd');
    expect(round(partial, 'r16').ties[0]!.id).toBe('tbd-r16-0');
    expect(gs.nextTieId).toMatch(/^tbd-r16-\d$/);
  });

  it('edges verilirse bağlantı edges’ten (takım eşlemesinden önce)', () => {
    const stages = stagesOf(uclSeason2526);
    const qf = build(2, 25580, stages);
    const realBayern = round(qf, 'qf').ties.find((t) => t.home?.name === 'Real Madrid')!;
    const atleticoArsenal = round(qf, 'sf').ties.find((t) => t.home?.name === 'Atlético de Madrid')!;
    // Yapay edge: Real–Bayern'in 2. maçı → Atlético–Arsenal yarı finalinin 1. maçı (takım eşlemesiyle çelişir).
    const withEdges = build(2, 25580, stages, [
      { child_fixture_id: realBayern.legs[1]!.fixtureId, parent_fixture_id: atleticoArsenal.legs[0]!.fixtureId, parent_outcome: 'winner' },
    ]);
    expect(round(withEdges, 'qf').ties.find((t) => t.home?.name === 'Real Madrid')!.nextTieId).toBe(atleticoArsenal.id);
    // Kaybedene giden edge (3.lük maçı) kazanan bağlantısı sayılmaz.
    const loserEdge = build(2, 25580, stages, [
      { child_fixture_id: realBayern.legs[1]!.fixtureId, parent_fixture_id: atleticoArsenal.legs[0]!.fixtureId, parent_outcome: 'loser' },
    ]);
    expect(round(loserEdge, 'qf').ties.find((t) => t.home?.name === 'Real Madrid')!.nextTieId).not.toBe(atleticoArsenal.id);
  });
});

describe('Şampiyonlar Ligi 26/27 (kura bekleniyor)', () => {
  const b = build(2, 28155, stagesOf(uclSeason2627));

  it('ön eleme listesi + lig aşaması; ağacın bütün turları boş kutu (play-off dahil: lig formatı)', () => {
    expect(b.rounds.map((r) => [r.key, r.kind, r.status, r.ties.length])).toEqual([
      ['stage-77483291', 'qualifying', 'done', 7],
      ['ko_po', 'bracket', 'tbd', 8],
      ['r16', 'bracket', 'tbd', 8],
      ['qf', 'bracket', 'tbd', 4],
      ['sf', 'bracket', 'tbd', 2],
      ['final', 'bracket', 'tbd', 1],
    ]);
    expect(b.leagueStage?.kind).toBe('league');
    const fb = b.rounds[0]!.ties.find((t) => t.home?.name === 'Fenerbahçe')!;
    expect(fb.agg).toEqual({ home: 3, away: 2, final: true });
    expect(fb.winnerId).toBe(88);
    expect(round(b, 'ko_po').ties[3]!.nextTieId).toBe('tbd-r16-3');
    expect(round(b, 'r16').ties[3]!.nextTieId).toBe('tbd-qf-1');
  });

  it('grup formatında (lig aşaması yok) play-off yuvası eklenmez', () => {
    const stages = stagesOf(uclSeason2627).filter((s) => s.type_id !== 223);
    expect(build(2, 28155, stages).rounds.map((r) => r.key)).not.toContain('ko_po');
  });
});

describe('Türkiye Kupası 25/26 (tek maç)', () => {
  const b = build(606, 26074, stagesOf(turkishCupSeason2526));

  it('erken turlar zaman sırasıyla (sort_order tekrarlıyor), grup aşaması ayrı, ağaç ÇF → Final', () => {
    expect(b.rounds.map((r) => [r.name, r.kind, r.status])).toEqual([
      ['1st Round', 'early', 'done'],
      ['Round 4', 'early', 'done'],
      ['Quarter-finals', 'bracket', 'done'],
      ['Semi-finals', 'bracket', 'done'],
      ['Final', 'bracket', 'done'],
    ]);
    expect(b.leagueStage).toEqual({ stageId: 77477994, name: 'Group Stage', kind: 'group' });
  });

  it('kazanan meta.winner’dan; penaltı ve uzatma notu', () => {
    const qf = round(b, 'qf').ties;
    const ts = qf.find((t) => t.away?.name === 'Trabzonspor')!;
    expect(ts.legs[0]).toMatchObject({ homeGoals: 0, awayGoals: 0, pens: { home: 1, away: 3 } });
    expect(ts).toMatchObject({ winnerId: 688, decidedBy: 'pen', pens: { home: 1, away: 3 } });
    expect(qf.find((t) => t.home?.name === 'Konyaspor')).toMatchObject({ winnerId: 2632, decidedBy: 'et' });
    expect(qf.find((t) => t.home?.name === 'Galatasaray')).toMatchObject({ winnerId: 286 });
    expect(qf.find((t) => t.home?.name === 'Galatasaray')!.decidedBy).toBeUndefined();
    const final = round(b, 'final').ties[0]!;
    expect(names(final)).toBe('Trabzonspor – Konyaspor');
    expect(final.winnerId).toBe(688);
  });

  it('hükmen (federasyon kararı) kazanan; ertelenip oynanmayan maç turu "sürüyor" göstermez', () => {
    const first = b.rounds[0]!;
    expect(first.ties.find((t) => t.legs[0]!.fixtureId === 19560532)).toMatchObject({ winnerId: expect.any(Number), decidedBy: 'awarded' });
    const postponed = first.ties.find((t) => t.legs[0]!.fixtureId === 19560523)!;
    expect(postponed.winnerId).toBeNull();
    expect(postponed.legs[0]!.homeGoals).toBeNull();
    expect(first.status).toBe('done');
  });

  it('ÇF → YF → Final bağlantısı ve sırası', () => {
    const [sf1, sf2] = round(b, 'sf').ties;
    const qf = round(b, 'qf').ties;
    expect(qf.slice(0, 2).every((t) => t.nextTieId === sf1!.id)).toBe(true);
    expect(qf.slice(2).every((t) => t.nextTieId === sf2!.id)).toBe(true);
    expect(names(sf1!)).toBe('Gençlerbirliği – Trabzonspor');
  });
});

describe('Türkiye Kupası 26/27 (sürüyor)', () => {
  const b = build(606, 28283, stagesOf(turkishCupSeason2627));

  it('bitmiş tur + oynanmamış güncel tur; ÇF/YF/Final kura bekliyor; grup aşaması henüz yok', () => {
    expect(b.rounds.map((r) => [r.name || r.key, r.status, r.ties.length])).toEqual([
      ['2nd Round', 'done', 2],
      ['3rd Round', 'current', 3],
      ['qf', 'tbd', 4],
      ['sf', 'tbd', 2],
      ['final', 'tbd', 1],
    ]);
    expect(b.leagueStage).toBeNull();
    const t = b.rounds[1]!.ties[0]!;
    expect(t.legs[0]).toMatchObject({ homeGoals: null, awayGoals: null, stateId: 1 });
    expect(t.winnerId).toBeNull();
  });
});

describe('veri yok', () => {
  it('aşama yok ya da başka ligin aşamaları → null', () => {
    expect(buildCupBracket({ leagueId: 2, seasonId: 1, stages: [], template: UCL })).toBeNull();
    expect(buildCupBracket({ leagueId: 5, seasonId: 25580, stages: stagesOf(uclSeason2526), template: UCL })).toBeNull();
  });
});
