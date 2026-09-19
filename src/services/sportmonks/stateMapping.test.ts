import { describe, it, expect } from 'vitest';
import { mapSportmonksStateToPhase, SPORTMONKS_STATE_BUCKETS } from './stateMapping';

/**
 * (id, short_name) çiftleri docs/SPORTMONKS_MIGRATION.md "Genel bulgular"
 * madde 4'teki gerçek `/states` tablosundan BİREBİR.
 */
const REAL_STATES: Array<[id: number, shortName: string]> = [
  [1, 'NS'], [2, '1st'], [3, 'HT'], [4, 'BRK'], [5, 'FT'], [6, 'et'], [7, 'AET'],
  [8, 'FTP'], [9, 'PEN'], [10, 'POST'], [11, 'SUSP'], [12, 'CANC'], [13, 'TBA'],
  [14, 'WO'], [15, 'ABAN'], [16, 'DELA'], [17, 'AWAR'], [18, 'INT'], [19, 'AU'],
  [20, 'DEL'], [21, 'ETB'], [22, '2nd'], [23, '2et'], [25, 'PENB'], [26, 'PEN'],
];

describe('SPORTMONKS_STATE_BUCKETS', () => {
  it('raporun 26 satırının tamamını (id 24 hariç — raporda da yok) içerir', () => {
    expect(Object.keys(SPORTMONKS_STATE_BUCKETS)).toHaveLength(25);
    for (const [id, shortName] of REAL_STATES) {
      expect(SPORTMONKS_STATE_BUCKETS[id]?.shortName).toBe(shortName);
    }
  });

  it('4 kovadan (NOT STARTED/IN PLAY/HALF TIME BREAK/FINISHED) başka bir değer üretmez', () => {
    const allowed = new Set(['NOT STARTED', 'IN PLAY', 'HALF TIME BREAK', 'FINISHED']);
    for (const entry of Object.values(SPORTMONKS_STATE_BUCKETS)) {
      expect(allowed.has(entry.bucket)).toBe(true);
    }
  });
});

describe('mapSportmonksStateToPhase', () => {
  it('id 9 ve id 26 AYNI short_name ("PEN") ama FARKLI id — id bazlı ayrıştırma doğru çalışır (Pass 5 keşfi)', () => {
    // id 9 = "Penalties" (canlı penaltı atışları) → IN PLAY
    expect(mapSportmonksStateToPhase(9)).toBe('IN PLAY');
    // id 26 = "Pending" → NOT STARTED
    expect(mapSportmonksStateToPhase(26)).toBe('NOT STARTED');
    // İkisi farklı kovaya düşmeli — short_name'e göre gruplansaydı bu ayrım kaybolurdu.
    expect(mapSportmonksStateToPhase(9)).not.toBe(mapSportmonksStateToPhase(26));
  });

  it('temel canlı/bitti/başlamadı durumlarını doğru eşler (gerçek NS/1st/HT/FT değerleriyle)', () => {
    expect(mapSportmonksStateToPhase(1)).toBe('NOT STARTED'); // NS
    expect(mapSportmonksStateToPhase(2)).toBe('IN PLAY'); // 1st
    expect(mapSportmonksStateToPhase(3)).toBe('HALF TIME BREAK'); // HT
    expect(mapSportmonksStateToPhase(5)).toBe('FINISHED'); // FT
    expect(mapSportmonksStateToPhase(22)).toBe('IN PLAY'); // 2nd
  });

  it('bilinmeyen bir state_id için güvenli varsayılan (NOT STARTED) döner', () => {
    expect(mapSportmonksStateToPhase(99999)).toBe('NOT STARTED');
  });
});
