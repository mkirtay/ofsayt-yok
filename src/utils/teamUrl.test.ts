import { describe, expect, it } from 'vitest';
import { parseTeamIdParam, teamHref, teamSlugParam } from './teamUrl';

describe('teamUrl', () => {
  it('ad ile slug, Türkçe karakterler sadeleşir', () => {
    expect(teamHref(34, 'Galatasaray')).toBe('/teams/34-galatasaray');
    expect(teamHref(595, 'İstanbul Başakşehir')).toBe('/teams/595-istanbul-basaksehir');
    expect(teamSlugParam(7, null)).toBe('7');
  });
  it('param ayrıştırma', () => {
    expect(parseTeamIdParam('34-galatasaray')).toBe('34');
    expect(parseTeamIdParam('34')).toBe('34');
    expect(parseTeamIdParam('[id]')).toBe('');
    expect(parseTeamIdParam('abc')).toBe('');
  });
});
