import { describe, it, expect } from 'vitest';
import { resolveParticipantLocation } from './participantLocation';
import type { SportmonksParticipant } from './types';

const participants: SportmonksParticipant[] = [
  { id: 88, name: 'Fenerbahçe', meta: { location: 'home', winner: false, position: 4 } },
  { id: 554, name: 'Beşiktaş', meta: { location: 'away', winner: true, position: 3 } },
];

describe('resolveParticipantLocation', () => {
  it('participant_id ev sahibiyse "home" döner', () => {
    expect(resolveParticipantLocation(88, participants)).toBe('home');
  });

  it('participant_id deplasmansa "away" döner', () => {
    expect(resolveParticipantLocation(554, participants)).toBe('away');
  });

  it('bilinmeyen bir participant_id için null döner', () => {
    expect(resolveParticipantLocation(999, participants)).toBeNull();
  });

  it('participantId veya participants eksikse null döner', () => {
    expect(resolveParticipantLocation(null, participants)).toBeNull();
    expect(resolveParticipantLocation(88, undefined)).toBeNull();
    expect(resolveParticipantLocation(88, null)).toBeNull();
  });
});
