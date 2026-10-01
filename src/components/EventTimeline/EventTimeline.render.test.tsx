import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MatchEvent } from '@/models/domain';
import EventTimeline from './index';

// Gerçek i18n: provider yokken varsayılan dil TR, TR `match` sözlüğü modül yüklenince kayıtlı.
function ev(over: Partial<MatchEvent>): MatchEvent {
  return {
    id: 1, player: { id: 1, name: 'Oyuncu' }, time: 10, event: 'GOAL', sort: 10,
    info: null, addition: null, is_home: true, is_away: false, ...over,
  };
}

const render = (events: MatchEvent[]) => renderToStaticMarkup(<EventTimeline events={events} />);

describe('EventTimeline ikonları', () => {
  it.each([
    ['PENALTY', 'Penaltı golü'],
    ['MISSED_PENALTY', 'Kaçan penaltı'],
    ['PENALTY_SHOOTOUT_GOAL', 'Seri penaltıda gol'],
    ['PENALTY_SHOOTOUT_MISS', 'Seri penaltıda kaçtı'],
    ['OWN_GOAL', 'Kendi kalesine'],
    ['YELLOW_RED_CARD', 'İkinci sarıdan kırmızı'],
    ['VAR', 'VAR incelemesi'],
    ['VAR_CARD', 'VAR incelemesi'],
  ])('%s → Türkçe aria-label + title, SVG ikon, varsayılan nokta yok', (event, label) => {
    const html = render([ev({ event })]);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain(`title="${label}"`);
    expect(html).toContain('<svg');
    expect(html).not.toContain('•');
  });

  it('penaltı golünde P, kendi kalesinde KK rozeti', () => {
    expect(render([ev({ event: 'PENALTY' })])).toMatch(/>P</);
    expect(render([ev({ event: 'PENALTY_SHOOTOUT_GOAL' })])).toMatch(/>P</);
    expect(render([ev({ event: 'OWN_GOAL' })])).toMatch(/>KK</);
  });
});

describe('EventTimeline VAR karar satırı', () => {
  it('bilinen karar Türkçe görünür satır olarak (tooltip değil) yazılır', () => {
    const html = render([ev({ event: 'VAR', addition: 'Penalty awarded' })]);
    expect(html).toContain('VAR: Penaltı verildi');
  });

  it('büyük/küçük harf farkı önemsiz', () => {
    expect(render([ev({ event: 'VAR', addition: 'Goal Disallowed' })])).toContain('VAR: Gol iptal');
    expect(render([ev({ event: 'VAR_CARD', addition: 'Card adjusted' })])).toContain('VAR: Kart değiştirildi');
  });

  it('bilinmeyen karar olduğu gibi gösterilir', () => {
    expect(render([ev({ event: 'VAR', addition: 'Something new' })])).toContain('VAR: Something new');
  });

  it('karar yoksa satır da yok; VAR dışı olayda info yazılmaz', () => {
    expect(render([ev({ event: 'VAR' })])).not.toContain('VAR:');
    expect(render([ev({ event: 'PENALTY', info: 'Penalty', addition: '1st Penalty' })])).not.toContain('1st Penalty');
  });
});
