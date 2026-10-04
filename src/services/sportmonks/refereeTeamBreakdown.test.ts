import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, refereeTeamBreakdown, type BreakdownFixture } from './refereeTeamBreakdown';

const GS = { id: 34, name: 'Galatasaray', image_path: 'gs.png' };
const TS = { id: 688, name: 'Trabzonspor' };
const FB = { id: 88, name: 'Fenerbahçe' };
const ev = (type_id: number, participant_id: number) => ({ type_id, participant_id });

describe('hakem takım kırılımı', () => {
  const fixtures: BreakdownFixture[] = [
    { id: 1, participants: [TS, GS], events: [ev(EVENT_TYPE.YELLOW, 688), ev(EVENT_TYPE.YELLOW, 688), ev(EVENT_TYPE.RED, 34), ev(EVENT_TYPE.PENALTY, 688), ev(14, 688)] },
    { id: 2, participants: [GS, FB], events: [ev(EVENT_TYPE.YELLOW_RED, 34), ev(EVENT_TYPE.MISSED_PENALTY, 88), ev(22, 34), ev(23, 88)] },
  ];
  const rows = refereeTeamBreakdown(fixtures);

  it('yönettiği tüm takımlar; sıralama YALNIZ maç sayısı (eşitlikte ada göre), kart sayısı sıralamaya girmez', () => {
    expect(rows.map((r) => [r.name, r.matches])).toEqual([
      ['Galatasaray', 2],
      ['Fenerbahçe', 1],
      ['Trabzonspor', 1],
    ]);
  });

  it('sarı / kırmızı (ikinci sarıdan kırmızı dahil) o takımın oyuncularına; penaltı (atılan + kaçan) o takım lehine; penaltı atışları sayılmaz', () => {
    const by = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(by.Trabzonspor).toMatchObject({ yellow: 2, red: 0, penaltiesFor: 1 });
    expect(by.Galatasaray).toMatchObject({ yellow: 0, red: 2, penaltiesFor: 0, logo: 'gs.png' });
    expect(by['Fenerbahçe']).toMatchObject({ yellow: 0, red: 0, penaltiesFor: 1 });
  });
});
