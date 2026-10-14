import { describe, expect, it } from 'vitest';
import { H2H_FOLLOWED_LINKS, h2hFollowedIds } from './h2hResult';

describe('karşılaşma geçmişi: izlenen bağlantılar', () => {
  it('tarihe göre en yeni 10 maç (gelen sıradan bağımsız); eskiler dışarıda', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i), date: `${2000 + i}-05-01`, scheduled: '20:00' })).reverse();
    rows.push({ id: 'x', date: '1999-01-01', scheduled: '20:00' });
    const ids = h2hFollowedIds(rows);
    expect(H2H_FOLLOWED_LINKS).toBe(10);
    expect([...ids].sort()).toEqual(['20', '21', '22', '23', '24', '25', '26', '27', '28', '29']);
  });

  it('aynı gün iki maçta saat belirler; 10’dan az satırda hepsi izlenir', () => {
    const ids = h2hFollowedIds([{ id: 'a', date: '2026-01-01', scheduled: '15:00' }, { id: 'b', date: '2026-01-01', scheduled: '21:00' }], 1);
    expect([...ids]).toEqual(['b']);
    expect(h2hFollowedIds([{ id: 'a', date: '2026-01-01' }]).size).toBe(1);
  });
});
