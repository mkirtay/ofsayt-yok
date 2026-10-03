import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Match } from '@/models/liveScore';
import TieLine from './TieLine';
import TiePill from '@/components/MatchCard/TiePill';
import MatchCard from '@/components/MatchCard';

const GS = { id: 34, name: 'Galatasaray' };
const JUV = { id: 625, name: 'Juventus' };
const m = (over: Partial<Match>): Match =>
  ({ id: 1, status: 'FINISHED', time: '', date: '2026-02-24', scheduled: '20:00', home: GS, away: JUV, ...over }) as Match;
const wrap = (el: React.ReactElement) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{el}</QueryClientProvider>);
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('toplam skor — maç satırı', () => {
  it('aggregate varsa: geniş "Top. 5–7", dar "(5–7)", etiket "Toplam 5–7"', () => {
    const html = wrap(<TieLine match={m({ leg: '2/2', scores: { score: '5-3' }, aggregate: { home: 5, away: 7, winner_id: 625 } })} />);
    expect(html).toContain('>Top. 5–7<');
    expect(html).toContain('>(5–7)<');
    expect(html).toContain('aria-label="Toplam 5–7"');
  });

  it('penaltılı bitiş: "PEN 4–3" / dar "P 4–3"', () => {
    const html = wrap(<TieLine match={m({ leg: '2/2', scores: { score: '2-1', ps_score: '4-3' }, aggregate: { home: 3, away: 3 } })} />);
    expect(html).toContain('>PEN 4–3<');
    expect(html).toContain('>P 4–3<');
    expect(html).toContain('aria-label="Toplam 3–3, penaltılar 4–3"');
  });

  it('veri henüz yok (1. ayak sonradan gelir): aynı yükseklikte boş satır — yer baştan ayrılı', () => {
    const html = wrap(<TieLine match={m({ leg: '2/2', status: 'NOT STARTED' })} />);
    expect(html).toMatch(/<span class="[^"]*tieLine[^"]*" aria-hidden="true">(&nbsp;|\u00a0)<\/span>/);
  });
});

describe('toplam skor — maç kartı hapı', () => {
  it('bitmiş eşleşme: "Toplam 5–7 · Juventus turu geçti"', () => {
    const html = wrap(<TiePill match={m({ leg: '2/2', aggregate: { home: 5, away: 7, winner_id: 625 } })} />);
    expect(text(html)).toBe('Toplam 5–7 · Juventus turu geçti');
  });

  it('penaltılı: "Toplam 3–3 · Galatasaray turu geçti · PEN 4–3"', () => {
    const html = wrap(<TiePill match={m({ leg: '2/2', scores: { score: '2-1', ps_score: '4-3' }, aggregate: { home: 3, away: 3 } })} />);
    expect(text(html)).toBe('Toplam 3–3 · Galatasaray turu geçti · PEN 4–3');
  });

  it('kartta yalnız 2. ayakta hap yeri var; boşken de aynı sabit yükseklikte', () => {
    expect(wrap(<MatchCard match={m({ leg: '2/2', status: 'NOT STARTED' })} />)).toMatch(/class="[^"]*tieRow[^"]*" aria-hidden="true"><\/div>/);
    expect(wrap(<MatchCard match={m({ leg: '1/2' })} />)).not.toContain('tieRow');
    expect(wrap(<MatchCard match={m({})} />)).not.toContain('tieRow');
  });
});

describe('CLS: sabit yükseklikler', () => {
  it('satır 40 px (değişmedi), toplam satırı 11 px, kart hapı alanı 28 px', () => {
    const listTsx = readFileSync(path.resolve(__dirname, 'index.tsx'), 'utf8');
    expect(listTsx).toContain('const MATCH_ROW_HEIGHT = 40;');
    const listScss = readFileSync(path.resolve(__dirname, 'matchList.module.scss'), 'utf8');
    expect(listScss).toMatch(/\.tieLine \{\s*display: block;\s*height: 11px;/);
    const cardScss = readFileSync(path.resolve(__dirname, '../MatchCard/matchCard.module.scss'), 'utf8');
    expect(cardScss).toMatch(/\.tieRow \{[^}]*height: 28px;/);
  });
});
