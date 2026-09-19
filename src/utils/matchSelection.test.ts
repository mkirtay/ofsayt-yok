import { describe, expect, it } from 'vitest';
import {
  buildSelectionTarget,
  isModifiedClick,
  readSelectedMatchId,
  readSelectedMatchParam,
  withSelectedMatch,
} from './matchSelection';

describe('okuma', () => {
  it('id ve id-slug biçimlerini okur', () => {
    expect(readSelectedMatchId({ match: '123-trabzonspor-galatasaray' })).toBe('123');
    expect(readSelectedMatchId({ match: '456' })).toBe('456');
    expect(readSelectedMatchParam({ match: ['789-a-b', 'x'] })).toBe('789-a-b');
  });
  it('geçersiz / eksik değerleri reddeder', () => {
    expect(readSelectedMatchId({})).toBeNull();
    expect(readSelectedMatchId({ match: '' })).toBeNull();
    expect(readSelectedMatchId({ match: 'abc' })).toBeNull();
    expect(readSelectedMatchId({ match: '../../etc' })).toBeNull();
    expect(readSelectedMatchId({ match: '12<script>' })).toBeNull();
  });
});

describe('withSelectedMatch / buildSelectionTarget', () => {
  it('match ekler ve diğer paramları korur', () => {
    expect(withSelectedMatch({ tab: 'live' }, '1-a-b')).toEqual({ tab: 'live', match: '1-a-b' });
  });
  it('match günceller (eskisini ezer)', () => {
    expect(withSelectedMatch({ match: '1-a-b', tab: 'live' }, '2-c-d')).toEqual({ tab: 'live', match: '2-c-d' });
  });
  it('null → match silinir', () => {
    expect(withSelectedMatch({ match: '1-a-b', tab: 'live' }, null)).toEqual({ tab: 'live' });
  });
  it('router hedefi', () => {
    expect(buildSelectionTarget('/', { panel: 'standings' }, '5-x-y')).toEqual({
      pathname: '/',
      query: { panel: 'standings', match: '5-x-y' },
    });
  });
});

describe('URL state geçmişi (geri/ileri simülasyonu)', () => {
  it('seç → değiştir → geri → seçim önceki maça döner; ileri → tekrar yeni maç', () => {
    // Tarayıcı geçmişini modelle: her push bir kayıt ekler, back/forward imleci kaydırır.
    const history: Record<string, string>[] = [{}];
    let cursor = 0;
    const push = (matchParam: string | null) => {
      const target = buildSelectionTarget('/', history[cursor]!, matchParam);
      history.splice(cursor + 1);
      history.push(target.query);
      cursor++;
    };
    const current = () => readSelectedMatchId(history[cursor]!);

    expect(current()).toBeNull();
    push('10-a-b');
    expect(current()).toBe('10');
    push('20-c-d');
    expect(current()).toBe('20');
    cursor--; // geri
    expect(current()).toBe('10');
    cursor--; // geri
    expect(current()).toBeNull();
    cursor += 2; // ileri x2
    expect(current()).toBe('20');
    push(null); // paneli kapat
    expect(current()).toBeNull();
    cursor--; // geri → panel yeniden açılır
    expect(current()).toBe('20');
  });
});

describe('isModifiedClick', () => {
  const base = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, button: 0 };
  it('düz sol tık split-view açar', () => expect(isModifiedClick(base)).toBe(false));
  it('cmd/ctrl/shift/alt/orta tuş normal link davranışına bırakılır', () => {
    expect(isModifiedClick({ ...base, metaKey: true })).toBe(true);
    expect(isModifiedClick({ ...base, ctrlKey: true })).toBe(true);
    expect(isModifiedClick({ ...base, shiftKey: true })).toBe(true);
    expect(isModifiedClick({ ...base, button: 1 })).toBe(true);
  });
});

import { buildTeamSelectionTarget, readSelectedTeamId, withSelectedTeam } from './matchSelection';

describe('takım paneli seçimi (?team=)', () => {
  it('yalnızca sayısal id okunur', () => {
    expect(readSelectedTeamId({ team: '13860' })).toBe('13860');
    expect(readSelectedTeamId({ team: ['34'] })).toBe('34');
    expect(readSelectedTeamId({ team: 'abc' })).toBeNull();
    expect(readSelectedTeamId({})).toBeNull();
  });
  it('takım seçmek match\'i düşürür, diğer paramlar (tab/panel) korunur', () => {
    expect(withSelectedTeam({ match: '1-a-b', tab: 'live' }, '13860')).toEqual({ tab: 'live', team: '13860' });
    expect(buildTeamSelectionTarget('/', { tab: 'live' }, null)).toEqual({ pathname: '/', query: { tab: 'live' } });
  });
  it('maç seçmek / paneli kapatmak team\'i düşürür (tek panel)', () => {
    expect(withSelectedMatch({ team: '13860', tab: 'live' }, '5-x-y')).toEqual({ tab: 'live', match: '5-x-y' });
    expect(withSelectedMatch({ team: '13860' }, null)).toEqual({});
  });
});
