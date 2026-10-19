/**
 * Hata ≠ veri yok: maç detayı kartları, puan durumu ve gol krallığı `error` verilince boş metin yerine
 * "yüklenemedi · tekrar dene" çizer; hata yokken eski boş durum aynen kalır.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import MatchStats from '@/components/MatchStats';
import EventTimeline from '@/components/EventTimeline';
import Lineup from '@/components/Lineup';
import MatchCompetitionStandings from '@/components/MatchCompetitionStandings';
import MatchCompetitionTopScorers from '@/components/MatchCompetitionTopScorers';
import type { Match } from '@/models/liveScore';

const finished = {
  id: 1,
  status: 'FINISHED',
  time: 'FT',
  date: '2026-10-11',
  scheduled: '16:00',
  competition: { id: 600, name: 'Super Lig' },
  home: { id: 1, name: 'A' },
  away: { id: 2, name: 'B' },
  scores: { score: '1 - 0' },
} as unknown as Match;

const noop = () => {};
const hasError = (el: ReactElement) => renderToStaticMarkup(el).includes('data-testid="load-error"');

describe('yüklenemedi durumu', () => {
  it.each([
    ['istatistik', (error: boolean) => <MatchStats stats={null} match={finished} error={error} onRetry={noop} />],
    ['olaylar', (error: boolean) => <EventTimeline events={[]} match={finished} error={error} onRetry={noop} />],
    ['kadro', (error: boolean) => <Lineup lineups={null} match={finished} error={error} onRetry={noop} />],
    ['puan durumu', (error: boolean) => <MatchCompetitionStandings data={null} error={error} onRetry={noop} />],
    ['gol krallığı', (error: boolean) => <MatchCompetitionTopScorers data={null} error={error} onRetry={noop} />],
  ])('%s: hata → "tekrar dene", hata yok → boş durum', (_name, render) => {
    expect(hasError(render(true))).toBe(true);
    expect(renderToStaticMarkup(render(true))).toContain('Tekrar Dene');
    expect(hasError(render(false))).toBe(false);
  });
});
