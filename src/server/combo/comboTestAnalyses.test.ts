import { describe, expect, it, vi } from 'vitest';
import { comboTestAnalysesPath, loadTestAnalyses } from './testAnalyses';

const ok = { matchId: '2001528958', homeTeamName: 'Türkiye', awayTeamName: 'Belçika', matchPrediction: { home: 40 }, goalExpectation: { over15: 80 } };

describe('test analizleri (yalnız geliştirme)', () => {
  it('production: env tanımlı olsa da yol null ve dosya HİÇ okunmaz', async () => {
    const read = vi.fn(async () => JSON.stringify([ok]));
    const env = { NODE_ENV: 'production', COMBO_TEST_ANALYSES_FILE: '/tmp/x.json' };
    expect(comboTestAnalysesPath(env)).toBeNull();
    expect(await loadTestAnalyses(env, read)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
  it('env yoksa okunmaz', async () => {
    const read = vi.fn();
    expect(await loadTestAnalyses({ NODE_ENV: 'development' }, read as never)).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
  it('geliştirme + env: dosya okunur, geçersiz öğeler elenir; bozuk / eksik dosya → boş', async () => {
    const env = { NODE_ENV: 'development', COMBO_TEST_ANALYSES_FILE: '/tmp/x.json' };
    expect(await loadTestAnalyses(env, async () => JSON.stringify([ok, { matchId: 1 }, null]))).toEqual([ok]);
    expect(await loadTestAnalyses(env, async () => 'not json')).toEqual([]);
    expect(await loadTestAnalyses(env, async () => { throw new Error('ENOENT'); })).toEqual([]);
    expect(await loadTestAnalyses(env, async () => '{}')).toEqual([]);
  });
});
