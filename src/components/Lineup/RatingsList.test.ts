import { describe, expect, it } from 'vitest';
import type { LineupPlayer } from '@/models/domain';
import { rankPlayers } from './RatingsList';

const p = (id: string, name: string, rating?: number): LineupPlayer => ({ id, name, rating, team_id: 't', substitution: '0', shirt_number: '1' });
const home = [p('1', 'Ali', 7.2), p('2', 'Can', 6.1), p('3', 'Oynamadı')];
const away = [p('4', 'Deniz', 7.8), p('5', 'Ece', 0)];

describe('rankPlayers', () => {
  it('iki takım tek listede, yüksekten düşüğe; reytingsiz / 0 olan girmez', () => {
    expect(rankPlayers(home, away, 'desc', 'all').map((r) => r.player.id)).toEqual(['4', '1', '2']);
  });
  it('düşükten yükseğe ve takım süzgeci', () => {
    expect(rankPlayers(home, away, 'asc', 'all').map((r) => r.player.id)).toEqual(['2', '1', '4']);
    expect(rankPlayers(home, away, 'desc', 'home').map((r) => r.side)).toEqual(['home', 'home']);
    expect(rankPlayers(home, away, 'desc', 'away').map((r) => r.player.id)).toEqual(['4']);
  });
});
