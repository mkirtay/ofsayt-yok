import { describe, expect, it } from 'vitest';
import type { SportmonksEventRow, SportmonksFixture } from '@/services/sportmonks/types';
import { buildGoalDraft } from './goalDraft';
import { computeStanding, eventsUpTo, isCreditedGoal, scoreAtEvent } from './goalStanding';
import { leagueDisplayName } from './leagueNames';
import { formatMinute, renderGoalPost } from './goalTemplates';

const HOME = 10;
const AWAY = 20;

let seq = 0;
function ev(over: Partial<SportmonksEventRow> & { type_id: number; minute: number }): SportmonksEventRow {
  seq += 1;
  return { id: seq, fixture_id: 1, participant_id: HOME, player_id: 100, player_name: 'Icardi', ...over };
}

function fixture(events: SportmonksEventRow[]): SportmonksFixture {
  return {
    id: 1,
    season_id: 99,
    league_id: 600,
    league: { id: 600, name: 'Super Lig' }, // API adı İngilizce/ASCII; metinde "Süper Lig" görünmeli
    participants: [
      { id: HOME, name: 'Galatasaray', meta: { location: 'home', winner: null } },
      { id: AWAY, name: 'Fenerbahçe', meta: { location: 'away', winner: null } },
    ],
    events,
  };
}

const ok = (r: ReturnType<typeof buildGoalDraft>) => {
  if (!r.ok) throw new Error(`draft failed: ${r.reason}`);
  return r;
};

describe('olay sınıflama ve skor', () => {
  it('kendi kalesine gol ve seri penaltı golcü kredisi/skor vermez; atılan penaltı kredi verir', () => {
    expect(isCreditedGoal(ev({ type_id: 14, minute: 1 }))).toBe(true);
    expect(isCreditedGoal(ev({ type_id: 16, minute: 1 }))).toBe(true);
    expect(isCreditedGoal(ev({ type_id: 15, minute: 1 }))).toBe(false);
    expect(isCreditedGoal(ev({ type_id: 23, minute: 120 }))).toBe(false);
    expect(isCreditedGoal(ev({ type_id: 17, minute: 5 }))).toBe(false);
  });

  it('skor olaylardan türetilir; seri penaltı/kaçan penaltı sayılmaz', () => {
    const events = [
      ev({ type_id: 14, minute: 10, participant_id: HOME }),
      ev({ type_id: 16, minute: 30, participant_id: AWAY }),
      ev({ type_id: 17, minute: 40, participant_id: HOME }),
      ev({ type_id: 23, minute: 120, participant_id: HOME }),
    ];
    expect(scoreAtEvent(events, HOME, AWAY)).toEqual({ home: 1, away: 1, reliable: true });
  });

  it('kendi kalesine gol varsa skor güvenilmez', () => {
    const events = [ev({ type_id: 15, minute: 10 })];
    expect(scoreAtEvent(events, HOME, AWAY).reliable).toBe(false);
  });

  it('eventsUpTo: kronolojik sıra ve id dahil kesme; bilinmeyen id null', () => {
    const late = ev({ type_id: 14, minute: 80 });
    const early = ev({ type_id: 14, minute: 5 });
    expect(eventsUpTo([late, early], late.id)?.map((e) => e.id)).toEqual([early.id, late.id]);
    expect(eventsUpTo([late, early], early.id)?.map((e) => e.id)).toEqual([early.id]);
    expect(eventsUpTo([late], 99999)).toBeNull();
  });
});

describe('computeStanding (lig bazlı gol krallığı)', () => {
  const base = [
    { playerId: 100, goals: 7 },
    { playerId: 200, goals: 8 },
    { playerId: 300, goals: 3 },
  ];
  const goalBy = (playerId: number, minute = 50) => ev({ type_id: 14, minute, player_id: playerId });

  it('tek başına liderliği alır (7 → 8 ile 8\'e eşit = ortak; 9 olunca tek lider)', () => {
    const g1 = goalBy(100, 10);
    expect(computeStanding({ scorerId: 100, baseline: base, upToEvent: [g1] }).milestone).toEqual({ kind: 'joint-lead', goals: 8 });
    const g2 = goalBy(100, 60);
    const r = computeStanding({ scorerId: 100, baseline: base, upToEvent: [g1, g2] });
    expect(r.before).toMatchObject({ goals: 8, rank: 1, leader: 'joint' });
    expect(r.milestone).toEqual({ kind: 'took-lead', goals: 9 });
  });

  it('zaten tek lider olan lideri sürdürür', () => {
    const r = computeStanding({ scorerId: 200, baseline: base, upToEvent: [goalBy(200)] });
    expect(r.milestone).toEqual({ kind: 'extended-lead', goals: 9 });
  });

  it('ilk 5 içindeyse sıra, dışındaysa hiçbir şey', () => {
    expect(computeStanding({ scorerId: 300, baseline: base, upToEvent: [goalBy(300)] }).milestone).toEqual({ kind: 'top-rank', goals: 4, rank: 3 });
    const wide = [...base, ...[1, 2, 3, 4, 5].map((i) => ({ playerId: 900 + i, goals: 20 }))];
    expect(computeStanding({ scorerId: 300, baseline: wide, upToEvent: [goalBy(300)] }).milestone).toEqual({ kind: 'none' });
  });

  it('aynı maçta rakibin önceki golü de hesaba katılır; kendi kalesine gol kimseye eklenmez', () => {
    const rival = goalBy(200, 5); // 200 → 9
    const own = ev({ type_id: 15, minute: 6, player_id: 100 });
    const mine = goalBy(100, 70); // 100 → 8, 200 → 9
    const r = computeStanding({ scorerId: 100, baseline: base, upToEvent: [rival, own, mine] });
    expect(r.after).toMatchObject({ goals: 8, rank: 2, leader: 'none' });
    expect(r.milestone).toEqual({ kind: 'top-rank', goals: 8, rank: 2 });
  });

  it('kaçan penaltı ve seri penaltı sayılmaz', () => {
    const r = computeStanding({
      scorerId: 100,
      baseline: base,
      upToEvent: [ev({ type_id: 17, minute: 20, player_id: 100 }), ev({ type_id: 23, minute: 120, player_id: 100 }), goalBy(100, 30)],
    });
    expect(r.after.goals).toBe(8);
  });

  it('atılan penaltı gol sayılır', () => {
    const r = computeStanding({ scorerId: 100, baseline: base, upToEvent: [ev({ type_id: 16, minute: 20, player_id: 100 })] });
    expect(r.after.goals).toBe(8);
  });

  it('baselineIncludesLiveGoals: tablo olduğu gibi, golcünün önceki değeri -1', () => {
    const live = [
      { playerId: 100, goals: 9 },
      { playerId: 200, goals: 8 },
    ];
    const r = computeStanding({ scorerId: 100, baseline: live, upToEvent: [goalBy(100)], baselineIncludesLiveGoals: true });
    expect(r.before).toMatchObject({ goals: 8, leader: 'joint' });
    expect(r.after).toMatchObject({ goals: 9, leader: 'sole' });
    expect(r.milestone).toEqual({ kind: 'took-lead', goals: 9 });
  });

  it('tabloda olmayan oyuncu (sezonun ilk golü) 1 gol ile hesaplanır', () => {
    const r = computeStanding({ scorerId: 555, baseline: base, upToEvent: [goalBy(555)] });
    expect(r.after).toMatchObject({ goals: 1, rank: 4 });
  });
});

describe('leagueDisplayName', () => {
  it('bilinen ligler Türkçe gösterilir, bilinmeyen lig API adında kalır', () => {
    expect(leagueDisplayName(600, 'Super Lig')).toBe('Süper Lig');
    expect(leagueDisplayName(603, '1. Lig')).toBe('1. Lig');
    expect(leagueDisplayName(2, 'UEFA Champions League')).toBe('Şampiyonlar Ligi');
    expect(leagueDisplayName(99999, ' Eredivisie ')).toBe('Eredivisie');
    expect(leagueDisplayName(undefined, undefined)).toBeNull();
  });
});

describe('buildGoalDraft + şablon', () => {
  const scorers = [
    { playerId: 100, goals: 8 },
    { playerId: 200, goals: 8 },
  ];

  it('lideri geçen gol: örnek cümle, skor, takım ve dakika', () => {
    const goal = ev({ type_id: 14, minute: 88, extra_minute: 2, player_id: 100 });
    const d = ok(buildGoalDraft({ fixture: fixture([goal]), eventId: goal.id, scorers, now: new Date('2026-09-22T12:00:00Z') }));
    expect(d.externalKey).toBe(`goal:1:${goal.id}`);
    expect(d.teamId).toBe(HOME);
    expect(d.matchId).toBe('1');
    expect(d.body).toBe(
      ["⚽ GOL! 88+2' Icardi (Galatasaray)", 'Galatasaray 1-0 Fenerbahçe', 'Bu golle Icardi, Süper Lig sezonunun en çok gol atan oyuncusu oldu (9 gol).'].join('\n'),
    );
    expect(d.warnings).toEqual([]);
  });

  it('beraberlikte "ortak lider" der, "tek lider" demez', () => {
    const tie = [
      { playerId: 100, goals: 7 },
      { playerId: 200, goals: 8 },
    ];
    const goal = ev({ type_id: 14, minute: 10, player_id: 100 });
    const d = ok(buildGoalDraft({ fixture: fixture([goal]), eventId: goal.id, scorers: tie }));
    expect(d.body).toContain('8 golle Süper Lig gol krallığında ortak lider.');
    expect(d.body).not.toContain('tek başına');
  });

  it('penaltı golü etiketlenir ve krediye dahil edilir', () => {
    const pen = ev({ type_id: 16, minute: 30, player_id: 100 });
    const d = ok(buildGoalDraft({ fixture: fixture([pen]), eventId: pen.id, scorers }));
    expect(d.body.split('\n')[0]).toBe("⚽ GOL (P)! 30' Icardi (Galatasaray)");
    expect(d.facts.milestone).toEqual({ kind: 'took-lead', goals: 9 });
  });

  it('kendi kalesine gol: kredi/istatistik yok, skor ve takım yazılmaz, uyarı var', () => {
    const own = ev({ type_id: 15, minute: 44, player_id: 300, player_name: 'Bacuna' });
    const d = ok(buildGoalDraft({ fixture: fixture([own]), eventId: own.id, scorers }));
    expect(d.body).toBe("⚽ 44' Bacuna kendi kalesine attı.");
    expect(d.teamId).toBeNull();
    expect(d.warnings.some((w) => w.startsWith('score-omitted'))).toBe(true);
  });

  it('golcü tablosu yoksa istatistik cümlesi yazılmaz (uydurma yok) ve uyarı düşer', () => {
    const goal = ev({ type_id: 14, minute: 5, player_id: 100 });
    const d = ok(buildGoalDraft({ fixture: fixture([goal]), eventId: goal.id, scorers: null }));
    expect(d.body).toBe("⚽ GOL! 5' Icardi (Galatasaray)\nGalatasaray 1-0 Fenerbahçe");
    expect(d.warnings.some((w) => w.startsWith('standing-omitted'))).toBe(true);
  });

  it('gol olmayan olay / bilinmeyen olay / isimsiz oyuncu / takımsız fixture reddedilir', () => {
    const card = ev({ type_id: 19, minute: 3 });
    expect(buildGoalDraft({ fixture: fixture([card]), eventId: card.id, scorers })).toEqual({ ok: false, reason: 'not-a-goal' });
    expect(buildGoalDraft({ fixture: fixture([card]), eventId: 424242, scorers })).toEqual({ ok: false, reason: 'event-not-found' });
    const anon = ev({ type_id: 14, minute: 3, player_name: '  ' });
    expect(buildGoalDraft({ fixture: fixture([anon]), eventId: anon.id, scorers })).toEqual({ ok: false, reason: 'missing-player-name' });
    const g = ev({ type_id: 14, minute: 3 });
    expect(buildGoalDraft({ fixture: { ...fixture([g]), participants: [] }, eventId: g.id, scorers })).toEqual({ ok: false, reason: 'missing-participants' });
  });

  it('metin 280 karakteri aşarsa uyarı verir', () => {
    const long = ev({ type_id: 14, minute: 3, player_name: 'X'.repeat(300) });
    const d = ok(buildGoalDraft({ fixture: fixture([long]), eventId: long.id, scorers: null }));
    expect(d.warnings.some((w) => w.startsWith('too-long'))).toBe(true);
  });

  it('şablon: lig adı yoksa istatistik cümlesi yok; dakika biçimi', () => {
    expect(formatMinute(45, 0)).toBe("45'");
    expect(formatMinute(45, 3)).toBe("45+3'");
    const text = renderGoalPost({
      kind: 'goal', playerName: 'A', teamName: 'T', minute: 1, extraMinute: null, homeName: 'H', awayName: 'V',
      score: null, leagueName: null, milestone: { kind: 'took-lead', goals: 3 },
    });
    expect(text).toBe("⚽ GOL! 1' A (T)");
  });
});
