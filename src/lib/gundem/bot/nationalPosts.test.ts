import { describe, expect, it } from 'vitest';
import type { Match } from '@/models/liveScore';
import { toAppId } from '@/services/apiFootball/ids';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import { POST_MAX_LENGTH } from '@/config/gundem';
import {
  buildNationalPreview,
  buildNationalRecap,
  selectNationalPreview,
  selectNationalRecap,
  selectNationalScope,
  turkiyeCompetitionIds,
  type GroupRow,
} from './nationalPosts';
import { turkiyeGroupFromTable } from './matchPostsTick';

const TR = toAppId(777);
const BEL = toAppId(1);
const ARM = toAppId(2);
const CYP = toAppId(3);
const ITA = toAppId(4);
const FRA = toAppId(5);
const UNL = toAppId(5_000); // turnuva id (yalnız eşleşme için)
const NOW = Date.parse('2026-11-12T15:30:00Z');

const at = (ms: number) => ({ date: new Date(ms).toISOString().slice(0, 10), scheduled: new Date(ms).toISOString().slice(11, 16) });
const m = (id: number, home: [number, string], away: [number, string], over: Partial<Match> = {}): Match =>
  ({
    id: toAppId(id),
    status: 'NOT STARTED',
    time: '',
    home: { id: home[0], name: home[1] },
    away: { id: away[0], name: away[1] },
    competition: { id: UNL, name: 'UEFA Uluslar Ligi' },
    ...at(NOW + 90 * 60_000),
    ...over,
  }) as Match;

const group: GroupRow[] = [
  { teamId: BEL, name: 'Belçika', rank: 1, points: 9, played: 4 },
  { teamId: TR, name: 'Türkiye', rank: 2, points: 7, played: 4 },
  { teamId: ARM, name: 'Ermenistan', rank: 3, points: 4, played: 4 },
  { teamId: CYP, name: 'Kıbrıs', rank: 4, points: 1, played: 4 },
];

const trBel = m(10, [TR, 'Türkiye'], [BEL, 'Belçika']);
const armCyp = m(11, [ARM, 'Ermenistan'], [CYP, 'Kıbrıs']);
const itaFra = m(12, [ITA, 'İtalya'], [FRA, 'Fransa']);

describe('milli maç kapsamı', () => {
  it('Türkiye maçı + Türkiye grubundaki maçlar; başka grup yok', () => {
    expect(turkiyeCompetitionIds([trBel, armCyp, itaFra])).toEqual([UNL]);
    const scope = selectNationalScope([trBel, armCyp, itaFra], new Map([[UNL, group]]));
    expect(scope.map((x) => x.id)).toEqual([trBel.id, armCyp.id]);
    // Grup okunamadıysa yalnız Türkiye maçı
    expect(selectNationalScope([trBel, armCyp], new Map()).map((x) => x.id)).toEqual([trBel.id]);
  });

  it('maç önü penceresi 1–2 sa; maç sonu yalnız bitmiş + skorlu + iptal değil', () => {
    const later = m(13, [TR, 'Türkiye'], [ARM, 'Ermenistan'], at(NOW + 5 * 3_600_000));
    expect(selectNationalPreview([trBel, later], NOW).map((x) => x.id)).toEqual([trBel.id]);
    const done = m(14, [ARM, 'Ermenistan'], [CYP, 'Kıbrıs'], { status: 'FINISHED', scores: { score: '1-2', ft_score: '1-2' }, ...at(NOW - 3 * 3_600_000) });
    const cancelled = { ...done, id: toAppId(15), state_code: 'CANCELLED' } as Match;
    expect(selectNationalRecap([done, cancelled, trBel], NOW).map((x) => x.id)).toEqual([done.id]);
  });
});

describe('milli maç metinleri', () => {
  it('analiz yoksa grup şablonu + soru; sınır içinde, bahis dili yok', () => {
    const d = buildNationalPreview(trBel, group, null)!;
    expect(d.externalKey).toBe(`preview:${trBel.id}`);
    expect(d.body.split('\n')[0]).toBe('Türkiye – Belçika (UEFA Uluslar Ligi), saat 20:00.');
    expect(d.body).toContain('Grupta Türkiye 2. (7 puan), Belçika 1. (9 puan).');
    expect(d.body.split('\n\n').length).toBe(2); // soru satırı
    expect(d.body.length).toBeLessThanOrEqual(POST_MAX_LENGTH);
    expect(findGamblingTerms(d.body)).toEqual([]);
  });

  it('analiz varsa önizleme + analiz görüşü', () => {
    const analysis = { id: 'a1', homeTeamName: 'Türkiye', awayTeamName: 'Belçika', matchPrediction: { home: 45, draw: 30, away: 25 }, fullReport: { matchSummary: { tempo: 'Tempolu bir maç bekleniyor.' } } };
    const d = buildNationalPreview(trBel, group, analysis)!;
    expect(d.body).toContain('Tempolu bir maç bekleniyor.');
    expect(d.body).toContain('Analiz görüşü: Türkiye kazanır %45');
  });

  it('maç sonu: Türkiye sonucu + kırmızı kart; Türkiye maçı değilse sonuç cümlesi yok', () => {
    const won = buildNationalRecap({ ...trBel, status: 'FINISHED', scores: { score: '2-1', ft_score: '2-1' }, red_cards: { home: 0, away: 1 } } as Match)!;
    expect(won.body.split('\n').slice(0, 3)).toEqual(['Maç sonu: Türkiye 2-1 Belçika (UEFA Uluslar Ligi)', 'Türkiye sahadan galibiyetle ayrıldı.', 'Maçta 1 kırmızı kart çıktı.']);
    const away = buildNationalRecap({ ...armCyp, status: 'FINISHED', scores: { score: '0-0' } } as Match)!;
    expect(away.body.split('\n')[0]).toBe('Maç sonu: Ermenistan 0-0 Kıbrıs (UEFA Uluslar Ligi)');
    expect(away.body).not.toContain('Türkiye');
  });
});

describe('puan durumundan Türkiye grubu', () => {
  const row = (teamId: number, name: string, rank: number) => ({ team_id: teamId, name, rank, points: 3, matches: 1 }) as never;
  it('gruplu aşamada Türkiye\'nin grubunu bulur; yoksa null', () => {
    const data = { stages: [{ groups: [{ id: 1, name: 'A', standings: [row(ITA, 'İtalya', 1), row(FRA, 'Fransa', 2)] }, { id: 2, name: 'B', standings: [row(BEL, 'Belçika', 1), row(TR, 'Türkiye', 2)] }] }] } as never;
    expect(turkiyeGroupFromTable(data)!.map((r) => r.teamId)).toEqual([BEL, TR]);
    expect(turkiyeGroupFromTable({ table: [row(ITA, 'İtalya', 1)] } as never)).toBeNull();
  });
});
