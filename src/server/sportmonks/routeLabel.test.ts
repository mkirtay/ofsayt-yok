import { describe, expect, it } from 'vitest';
import { normalizeRouteLabel } from './routeLabel';

describe('normalizeRouteLabel — kota sayacında sabit rota adı', () => {
  it('maç sayfaları ve _next/data istekleri tek ad', () => {
    expect(normalizeRouteLabel('GET /matches/19713563-inter-parma')).toBe('GET /matches/[slug]');
    expect(normalizeRouteLabel('GET /matches/1064923-aston-villa-sk-rapid')).toBe('GET /matches/[slug]');
    expect(normalizeRouteLabel('GET /_next/data/VqYpljyflmPEFDD9ZbdPF/matches/19745036-real-oviedo-sd-eibar.json')).toBe(
      'GET /_next/data/*/matches/[slug].json',
    );
    expect(normalizeRouteLabel('GET /_next/data/hyAUL9pqijn5Xjbi38qUw/hakem/[slug].json')).toBe('GET /_next/data/*/hakem/[slug].json');
  });

  it('API yolları korunur; sayısal segment :id; parametreli adlar dokunulmaz', () => {
    expect(normalizeRouteLabel('GET /api/matches/day')).toBe('GET /api/matches/day');
    expect(normalizeRouteLabel('GET /api/matches/19746594/live')).toBe('GET /api/matches/:id/live');
    expect(normalizeRouteLabel('GET /api/sportmonks/football/fixtures/19746594')).toBe('GET /api/sportmonks/football/fixtures/:id');
    expect(normalizeRouteLabel('GET /teknik-direktor/[slug]')).toBe('GET /teknik-direktor/[slug]');
    expect(normalizeRouteLabel('getStaticProps (/teknik-direktor/[slug])')).toBe('getStaticProps (/teknik-direktor/[slug])');
    expect(normalizeRouteLabel('POST /api/admin/gundem/bot-tick')).toBe('POST /api/admin/gundem/bot-tick');
    expect(normalizeRouteLabel('GET /index')).toBe('GET /index');
  });
});
