import { describe, expect, it } from 'vitest';
import { parseNationalFlag } from './nationalMatches';

describe('NATIONAL_MATCHES_ENABLED', () => {
  it('varsayılan kapalı; yalnız 1/true/on açar', () => {
    for (const v of [undefined, null, '', '0', 'false', 'off', 'public', 'yes']) expect(parseNationalFlag(v)).toBe(false);
    for (const v of ['1', 'true', 'TRUE', ' on ']) expect(parseNationalFlag(v)).toBe(true);
  });
});

import { compareGroupedLeagues } from './leagues';
import { toAppId } from '@/services/apiFootball/ids';

describe('liste sırası: milli turnuvalar en üstte', () => {
  const g = (id: number, name = 'x') => ({ competition_id: id, competition_name: name });
  it('milli > Süper Lig / UEFA; milli kendi arasında öncelik sırasıyla; lig sırası değişmez', () => {
    const unl = g(toAppId(5), 'UEFA Uluslar Ligi');
    const friendly = g(toAppId(10), 'Hazırlık Maçları');
    const wcq = g(toAppId(32), 'DK Elemeleri');
    const superLig = g(600, 'Super Lig');
    const groups = [superLig, friendly, g(2, 'Champions League'), wcq, unl];
    const sorted = [...groups].sort(compareGroupedLeagues).map((x) => x.competition_id);
    expect(sorted.slice(0, 3)).toEqual([toAppId(5), toAppId(32), toAppId(10)]);
    expect(compareGroupedLeagues(superLig, g(2, 'Champions League'))).toBe(compareGroupedLeagues(superLig, g(2, 'Champions League')));
  });
});

import { nationalTeamNameTr } from './nationalTeamNames';
describe('milli takım adları Türkçe', () => {
  it('ISO tablosu + elle düzeltmeler; bilinmeyen ad aynen', () => {
    expect(nationalTeamNameTr('Italy')).toBe('İtalya');
    expect(nationalTeamNameTr('Norway')).toBe('Norveç');
    expect(nationalTeamNameTr('USA')).toBe('ABD');
    expect(nationalTeamNameTr('Rep. Of Ireland')).toBe('İrlanda');
    expect(nationalTeamNameTr('England')).toBe('İngiltere');
    expect(nationalTeamNameTr('Narnia')).toBe('Narnia');
  });
});

import { nationalAnalysisEnabled } from './nationalMatches';
import { vi } from 'vitest';
describe('milli maç AI analizi bayrağı', () => {
  it('yalnız iki bayrak birlikte açıkken açık', () => {
    vi.stubEnv('NATIONAL_MATCHES_ENABLED', '1');
    vi.stubEnv('NATIONAL_ANALYSIS_ENABLED', '');
    expect(nationalAnalysisEnabled()).toBe(false);
    vi.stubEnv('NATIONAL_ANALYSIS_ENABLED', '1');
    expect(nationalAnalysisEnabled()).toBe(true);
    vi.stubEnv('NATIONAL_MATCHES_ENABLED', '');
    expect(nationalAnalysisEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
