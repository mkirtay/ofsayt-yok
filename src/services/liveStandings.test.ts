import { describe, expect, it, vi } from 'vitest';

const request = vi.fn();
vi.mock('./sportmonksRuntimeClient', () => ({ sportmonksClientRequest: (...a: unknown[]) => request(...a) }));

const { applyLiveStandings, fetchLiveStandings, hasLiveMatchInLeague, isLiveMatchStatus, standingsMatchesInLeague, verifyFixtureScore } =
  await import('./liveStandings');

const base = (id: number, rank: number, points: number, extra: Record<string, number> = {}) => ({
  rank,
  points,
  team: { id },
  team_id: id,
  matches: 8,
  won: 5,
  drawn: 1,
  lost: 2,
  goals_scored: 15,
  goals_conceded: 10,
  goal_diff: 5,
  ...extra,
});
const live = (participant_id: number, position: number, points: number, extra: Record<string, unknown> = {}) => ({
  participant_id,
  position,
  points,
  result: 'equal',
  season_id: 28203,
  stage_id: 1,
  group_id: null,
  ...extra,
});
const fx = (id: number, home: number, away: number, score: string | null, status = 'IN PLAY', extra: Record<string, unknown> = {}) => ({
  id,
  status,
  time: "71'",
  home: { id: home, name: `Ev ${home}` },
  away: { id: away, name: `Dep ${away}` },
  scores: score == null ? undefined : { score },
  competition: { id: 600 },
  ...extra,
});
const L = (rows: ReturnType<typeof live>[]) => ({ leagueId: 600, rows });

describe('fetchLiveStandings', () => {
  it('tek istek (include yok), geçersiz satırlar atılır; hata fırlatır', async () => {
    request.mockResolvedValueOnce({ data: [live(34, 1, 22), { participant_id: null, position: 2, points: 1 }] });
    await expect(fetchLiveStandings(600)).resolves.toEqual({ leagueId: 600, rows: [live(34, 1, 22)] });
    expect(request).toHaveBeenCalledWith('football', '/standings/live/leagues/600');
    request.mockRejectedValueOnce(new Error('429'));
    await expect(fetchLiveStandings(600)).rejects.toThrow('429');
  });
});

describe('applyLiveStandings — sıra ve puan', () => {
  const rows = [base(34, 1, 19), base(88, 2, 17), base(2, 3, 16)];

  it('sıra + puan sağlayıcıdan, canlı sıraya göre; fark maç öncesi tabloya göre (basamak sayısı)', () => {
    const out = applyLiveStandings(rows, L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19)]), { seasonId: 28203 });
    expect(out.live).toBe(true);
    expect(out.rows.map((r) => [r.teamId, r.rank, r.points, r.rankDelta, r.pointsDelta])).toEqual([
      [2, 1, 19, 2, 3],
      [34, 2, 19, -1, 0],
      [88, 3, 17, -1, 0],
    ]);
  });

  it("aynı canlı veri tekrar gelince oklar kaybolmaz (fark son poll'a değil temel tabloya göre)", () => {
    const data = L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19)]);
    const a = applyLiveStandings(rows, data);
    const b = applyLiveStandings(rows, data, { verified: a.verified });
    expect(b.rows.map((r) => r.rankDelta)).toEqual([2, -1, -1]);
  });

  it('eşitlikte sağlayıcının sırası korunur (bizim puan/averaj varsayımımızla yeniden sıralanmaz)', () => {
    // 88 ve 2 eşit puanda; sağlayıcı (ikili averaj vb.) 2'yi öne alıyor, düz averaj 88'i öne alırdı.
    const tied = [base(34, 1, 19), base(88, 2, 16, { goal_diff: 9 }), base(2, 3, 16, { goal_diff: 1 })];
    const out = applyLiveStandings(tied, L([live(34, 1, 19), live(2, 2, 16), live(88, 3, 16)]));
    expect(out.rows.map((r) => r.teamId)).toEqual([34, 2, 88]);
  });

  it('uygulanamazsa normal tablo (live: false): veri yok / sezon farklı / eksik takım / tekrar eden sıra', () => {
    expect(applyLiveStandings(rows, null).live).toBe(false);
    expect(applyLiveStandings(rows, L([])).live).toBe(false);
    const all = [live(34, 1, 19), live(88, 2, 17), live(2, 3, 16)];
    expect(applyLiveStandings(rows, L(all), { seasonId: 25749 }).live).toBe(false);
    expect(applyLiveStandings(rows, L(all.slice(0, 2)), { seasonId: 28203 }).live).toBe(false);
    expect(applyLiveStandings(rows, L([live(34, 1, 19), live(88, 1, 17), live(2, 3, 16)])).live).toBe(false);
    // Normal tablo da aynı biçimde: temel sıra, fark yok.
    expect(applyLiveStandings(rows, null).rows.map((r) => [r.teamId, r.rank, r.rankDelta, r.pointsDelta])).toEqual([
      [34, 1, 0, 0],
      [88, 2, 0, 0],
      [2, 3, 0, 0],
    ]);
  });

  it('çok aşamalı ligde aynı takımın satırı aşama id ile seçilir; aşama verilmezse belirsizlik → normal tablo', () => {
    const two = L([live(34, 5, 10, { stage_id: 1 }), live(34, 1, 3, { stage_id: 2 })]);
    expect(applyLiveStandings([base(34, 1, 3)], two, { stageId: 2 }).rows[0]).toMatchObject({ rank: 1, points: 3, rankDelta: 0 });
    expect(applyLiveStandings([base(34, 1, 3)], two).live).toBe(false);
  });
});

describe('applyLiveStandings — canlı skor ve istatistik (çift sayım yok)', () => {
  const rows = [base(34, 1, 19), base(88, 2, 17), base(2, 3, 16), base(7, 4, 10)];

  it('skor sağlayıcı puanıyla tutarlıysa O/G/B/M/A/Y/Av güncellenir; takımın gözünden skor + rakip', () => {
    // 2 – 34: 1–0 (2 kazanıyor: 16 + 3 = 19, 34 kaybediyor: 19)
    const out = applyLiveStandings(rows, L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19), live(7, 4, 10)]), {
      fixtures: [fx(9, 2, 34, '1-0')],
    });
    const t2 = out.rows.find((r) => r.teamId === 2)!;
    const t34 = out.rows.find((r) => r.teamId === 34)!;
    expect(t2.statsLive).toBe(true);
    expect(t2.stats).toEqual({ matches: 9, won: 6, drawn: 1, lost: 2, goalsFor: 16, goalsAgainst: 10, goalDiff: 6 });
    expect(t34.stats).toEqual({ matches: 9, won: 5, drawn: 1, lost: 3, goalsFor: 15, goalsAgainst: 11, goalDiff: 4 });
    expect(t2.fixture).toMatchObject({ isHome: true, opponentId: 34, goalsFor: 1, goalsAgainst: 0 });
    expect(t34.fixture).toMatchObject({ isHome: false, opponentId: 2, goalsFor: 0, goalsAgainst: 1 });
    expect(out.fixtures.map((f) => f.id)).toEqual([9]);
    expect(out.verified.get('9')).toEqual([1, 0]);
    // Maçı olmayan takım: temel istatistik, alt satır yok.
    expect(out.rows.find((r) => r.teamId === 88)).toMatchObject({ statsLive: false, fixture: null });
  });

  it('sağlayıcının tablosu maçı zaten içeriyor / resmî tablo güncellenmiş → puan ve gol İKİNCİ KEZ eklenmez', () => {
    // Temel tablo 2'nin galibiyetini zaten saymış (19 puan, 9 maç); sağlayıcı da 19 diyor.
    const counted = [base(34, 2, 19, { matches: 9 }), base(88, 3, 17), base(2, 1, 19, { matches: 9, goal_diff: 6 }), base(7, 4, 10)];
    const out = applyLiveStandings(counted, L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19), live(7, 4, 10)]), {
      fixtures: [fx(9, 2, 34, '1-0')],
    });
    const t2 = out.rows.find((r) => r.teamId === 2)!;
    expect(t2).toMatchObject({ points: 19, pointsDelta: 0, statsLive: false });
    expect(t2.stats).toMatchObject({ matches: 9, goalDiff: 6 });
    expect(out.verified.size).toBe(0);
  });

  it('gol sonrası sağlayıcı geride: son doğrulanmış skor kullanılır; o da yoksa temel istatistik (uydurma yok)', () => {
    const provider = L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19), live(7, 4, 10)]); // hâlâ 1–0 puanları
    const first = applyLiveStandings(rows, provider, { fixtures: [fx(9, 2, 34, '1-0')] });
    // Beraberlik golü geldi (1–1) ama sağlayıcı henüz işlemedi.
    const lag = applyLiveStandings(rows, provider, { fixtures: [fx(9, 2, 34, '1-1')], verified: first.verified });
    const t2 = lag.rows.find((r) => r.teamId === 2)!;
    expect(t2.fixture).toMatchObject({ goalsFor: 1, goalsAgainst: 1 }); // alt satır güncel skoru gösterir
    expect(t2.stats.goalDiff).toBe(6); // istatistik doğrulanmış 1–0'dan
    const noPrev = applyLiveStandings(rows, provider, { fixtures: [fx(9, 2, 34, '1-1')] });
    expect(noPrev.rows.find((r) => r.teamId === 2)).toMatchObject({ statsLive: false, stats: { matches: 8, goalDiff: 5 } });
    // Sağlayıcı beraberliği işledi: 2 → 17, 34 → 20.
    const caught = applyLiveStandings(rows, L([live(34, 1, 20), live(88, 2, 17), live(2, 3, 17), live(7, 4, 10)]), {
      fixtures: [fx(9, 2, 34, '1-1')],
      verified: lag.verified,
    });
    expect(caught.rows.find((r) => r.teamId === 2)).toMatchObject({ points: 17, pointsDelta: 1, stats: { matches: 9, drawn: 2, goalDiff: 5 } });
    expect(caught.verified.get('9')).toEqual([1, 1]);
  });

  it('iptal edilen gol: skor geri döner, istatistik ve puan sağlayıcıyla birlikte geri gelir', () => {
    const win = L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19), live(7, 4, 10)]);
    const two = applyLiveStandings(rows, win, { fixtures: [fx(9, 2, 34, '2-0')] });
    expect(two.rows.find((r) => r.teamId === 2)!.stats.goalDiff).toBe(7);
    // VAR golü iptal etti: 1–0
    const back = applyLiveStandings(rows, win, { fixtures: [fx(9, 2, 34, '1-0')], verified: two.verified });
    expect(back.rows.find((r) => r.teamId === 2)!.stats).toMatchObject({ goalsFor: 16, goalDiff: 6 });
    // Beraberlik golü iptal: skor 1–1 → 1–0, sağlayıcı hâlâ beraberlik puanında → doğrulanmış 1–1 kalır, sonra düzelir.
    const draw = L([live(34, 1, 20), live(88, 2, 17), live(2, 3, 17), live(7, 4, 10)]);
    const d = applyLiveStandings(rows, draw, { fixtures: [fx(9, 2, 34, '1-1')] });
    const undo = applyLiveStandings(rows, draw, { fixtures: [fx(9, 2, 34, '1-0')], verified: d.verified });
    expect(undo.rows.find((r) => r.teamId === 2)).toMatchObject({
      points: 17,
      stats: { drawn: 2, goalDiff: 5 },
      fixture: { goalsFor: 1, goalsAgainst: 0 },
    });
    const fixed = applyLiveStandings(rows, win, { fixtures: [fx(9, 2, 34, '1-0')], verified: undo.verified });
    expect(fixed.rows.find((r) => r.teamId === 2)).toMatchObject({ points: 19, stats: { won: 6, goalDiff: 6 } });
  });

  it('eş zamanlı birden çok maç + devre arası; skorsuz maçta alt satır skor uydurmaz', () => {
    const out = applyLiveStandings(rows, L([live(34, 1, 20), live(88, 2, 17), live(2, 3, 17), live(7, 4, 10)]), {
      fixtures: [fx(9, 2, 34, '0-0', 'HALF TIME BREAK'), fx(10, 88, 7, null)],
    });
    expect(out.fixtures.map((f) => f.id)).toEqual([9, 10]);
    expect(out.rows.find((r) => r.teamId === 34)).toMatchObject({ pointsDelta: 1, statsLive: true, stats: { matches: 9, drawn: 2 } });
    expect(out.rows.find((r) => r.teamId === 88)).toMatchObject({ statsLive: false, fixture: { goalsFor: null, goalsAgainst: null } });
  });

  it('maç sonu: biten maç şerit/alt satırdan çıkar; resmî tablo gecikmişse doğrulanarak sayılır, güncellenince sayılmaz', () => {
    const provider = L([live(34, 2, 19), live(88, 3, 17), live(2, 1, 19), live(7, 4, 10)]);
    const ended = applyLiveStandings(rows, provider, { fixtures: [fx(9, 2, 34, '1-0', 'FINISHED')] });
    expect(ended.fixtures).toEqual([]);
    expect(ended.rows.find((r) => r.teamId === 2)).toMatchObject({ fixture: null, statsLive: true, stats: { matches: 9 } });
    const official = [base(34, 2, 19, { matches: 9 }), base(88, 3, 17), base(2, 1, 19, { matches: 9 }), base(7, 4, 10)];
    const updated = applyLiveStandings(official, provider, { fixtures: [fx(9, 2, 34, '1-0', 'FINISHED')], verified: ended.verified });
    expect(updated.rows.find((r) => r.teamId === 2)).toMatchObject({ statsLive: false, pointsDelta: 0, stats: { matches: 9 } });
    // İptal / hükmen (özel durum) maç skoru hiç eklenmez.
    const awarded = applyLiveStandings(rows, provider, { fixtures: [fx(9, 2, 34, '1-0', 'FINISHED', { state_code: 'AWARDED' })] });
    expect(awarded.rows.find((r) => r.teamId === 2)!.statsLive).toBe(false);
  });

  it('tabloda tek takım (gruplar arası maç): yalnız o takım puan aldıysa doğrulanır', () => {
    expect(verifyFixtureScore([[2, 1]], { base: 10, live: 13 }, null)).toEqual([2, 1]);
    expect(verifyFixtureScore([[0, 1]], { base: 10, live: 10 }, null)).toBeNull(); // kayıp: "zaten sayıldı"dan ayrılamaz
    expect(verifyFixtureScore([[1, 1], [1, 0]], { base: 10, live: 13 }, { base: 5, live: 5 })).toEqual([1, 0]);
  });
});

describe('canlı kapısı ve maç listesi', () => {
  it('yalnız o ligin oynanan / devre arasındaki maçı', () => {
    const m = (id: number, status: string) => ({ competition: { id }, status });
    expect(hasLiveMatchInLeague([m(600, 'IN PLAY')], 600)).toBe(true);
    expect(hasLiveMatchInLeague([m(600, 'HALF TIME BREAK')], 600)).toBe(true);
    expect(hasLiveMatchInLeague([m(600, 'FINISHED'), m(8, 'IN PLAY')], 600)).toBe(false);
    expect(hasLiveMatchInLeague([m(600, 'IN PLAY')], null)).toBe(false);
    expect(isLiveMatchStatus('NOT STARTED')).toBe(false);
    expect(isLiveMatchStatus(undefined)).toBe(false);
  });

  it('tabloya verilecek maçlar: ligin canlı + normal biten maçları, tekil (ilk geçen kalır)', () => {
    const list = [
      fx(1, 2, 34, '1-0'),
      fx(1, 2, 34, '0-0'),
      fx(2, 88, 7, '2-2', 'FINISHED'),
      fx(3, 88, 7, null, 'NOT STARTED'),
      fx(4, 88, 7, '0-0', 'FINISHED', { state_code: 'CANCELLED' }),
      fx(5, 1, 3, '1-0', 'IN PLAY', { competition: { id: 8 } }),
    ];
    expect(standingsMatchesInLeague(list, 600).map((m) => [m.id, m.scores?.score])).toEqual([
      [1, '1-0'],
      [2, '2-2'],
    ]);
    expect(standingsMatchesInLeague(list, null)).toEqual([]);
  });
});
