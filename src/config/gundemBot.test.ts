import { describe, expect, it } from 'vitest';
import { DEFAULT_BOT_LEAGUE_IDS, getBotLeagueIds } from './gundemBot';

describe('getBotLeagueIds', () => {
  it('env yoksa/boşsa/geçersizse varsayılan liste', () => {
    expect([...getBotLeagueIds('')].sort()).toEqual([...DEFAULT_BOT_LEAGUE_IDS].sort());
    expect([...getBotLeagueIds('abc, -1')].sort()).toEqual([...DEFAULT_BOT_LEAGUE_IDS].sort());
  });
  it('env ile değiştirilir', () => {
    expect([...getBotLeagueIds('600, 8')]).toEqual([600, 8]);
  });
});
