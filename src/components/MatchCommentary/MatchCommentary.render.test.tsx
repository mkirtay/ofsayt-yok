import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Match } from '@/models/liveScore';
import { normalizeCommentary, type RawComment } from '@/services/sportmonks/matchCommentary';
import sample from '@/services/sportmonks/__fixtures__/commentarySuperLig.json';
import MatchCommentary, { CommentaryView, matchesFilter, minuteLabel, type CommentaryFilter } from './index';

// Gerçek i18n: provider yokken varsayılan dil TR, TR `match` sözlüğü modül yüklenince kayıtlı.
const items = normalizeCommentary((sample as Record<string, RawComment[]>)['19746587']);
const view = (filter: CommentaryFilter = 'all', locale = 'tr', live = false) =>
  renderToStaticMarkup(<CommentaryView items={items} live={live} filter={filter} onFilter={() => {}} locale={locale} />);

describe('<CommentaryView />', () => {
  it('filtre çipleri bu sırayla, Tümü seçili; türlerin sayısı çipte', () => {
    const html = view();
    const chips = [...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>(.*?)<\/button>/g)].map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]);
    expect(chips).toEqual([
      ['true', 'Tümü'],
      ['false', 'Goller2'],
      ['false', 'Kartlar1'],
      ['false', 'Şutlar38'],
      ['false', 'Değişiklikler10'],
      ['false', 'Önemli3'],
    ]);
  });

  it('en yeni üstte; dakika rozeti uzatmayla (90+4), Türkçe metin', () => {
    const html = view();
    expect(html.indexOf('Maç 0-1 sona erdi.')).toBeLessThan(html.indexOf('90+4'));
    expect(html.indexOf('90+4')).toBeLessThan(html.indexOf('Maç başladı!'));
    expect(html).toContain('Thalisson Kelven da Silva kafayla vurdu, isabet yok.');
    expect(html).not.toContain('lang="en"');
  });

  it('Kartlar filtresi yalnız kart satırları; boş filtre ayrı metin', () => {
    const html = view('cards');
    expect((html.match(/<li/g) ?? []).length).toBe(1);
    expect(html).toContain('Victor James Osimhen sarı kart gördü.');
    const empty = renderToStaticMarkup(
      <CommentaryView items={items.filter((i) => i.kind !== 'card')} live={false} filter="cards" onFilter={() => {}} locale="tr" />,
    );
    expect(empty).toContain('Bu filtrede satır yok.');
  });

  it('EN arayüzde Sportmonks metni (lang="en")', () => {
    const html = view('all', 'en');
    expect(html).toContain('Match ends with a score of 0-1.');
    expect(html).toContain('lang="en"');
  });

  it('canlıda yenileme notu', () => {
    expect(view('all', 'tr', true)).toContain('Canlı · dakikada bir yenilenir');
    expect(view()).not.toContain('Canlı · dakikada');
  });
});

describe('<MatchCommentary /> ilk durum', () => {
  const match = (status: string, extra: Record<string, unknown> = {}) => ({ id: 1, status, ...extra }) as unknown as Match;

  it('başlamamış maç: bekleme sahnesi + metin (istek yok, iskelet yok)', () => {
    const html = renderToStaticMarkup(<MatchCommentary matchId="1" match={match('NOT STARTED')} />);
    expect(html).toContain('Anlatım maç başlayınca burada akacak.');
    expect(html).toContain('Maç henüz başlamadı.');
    // Sahne ayrı chunk: ilk boyamada aynı oranda yer tutucu durur (kayma yok).
    expect(html).toMatch(/_scenePlaceholder_/);
  });

  it('başlamamış maçta ilk düdük saati ve geri sayım satırı (saat SSR\'da sabit)', () => {
    const html = renderToStaticMarkup(
      <MatchCommentary matchId="1" match={match('NOT STARTED', { date: '2026-10-21', scheduled: '19:00:00' })} />,
    );
    expect(html).toContain('İlk düdük:');
    expect(html).toMatch(/_preCountdown_/);
  });

  it('başlamış/bitmiş maç: veri gelene kadar iskelet', () => {
    const html = renderToStaticMarkup(<MatchCommentary matchId="1" match={match('FINISHED')} />);
    expect(html).not.toContain('Anlatım maç başlayınca');
    expect(html).not.toContain('Maç Anlatımı');
  });
});

describe('yardımcılar', () => {
  it('minuteLabel', () => {
    expect(minuteLabel({ minute: 90, extraMinute: 4 })).toBe('90+4');
    expect(minuteLabel({ minute: 12, extraMinute: null })).toBe('12');
    expect(minuteLabel({ minute: null, extraMinute: null })).toBeNull();
  });

  it('Önemli = is_important ya da gol', () => {
    expect(items.filter((i) => matchesFilter(i, 'important')).every((i) => i.important)).toBe(true);
  });
});
