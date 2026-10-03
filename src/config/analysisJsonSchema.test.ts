import { describe, expect, it } from 'vitest';
import { ANALYSIS_JSON_SCHEMA, ANALYSIS_RESPONSE_FORMAT } from './analysisJsonSchema';
import { buildAnalysisUserMessage } from './analysisPrompt';
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

type Node = { type?: string; properties?: Record<string, Node>; required?: string[]; additionalProperties?: boolean; items?: Node };

function walk(n: Node, path: string, visit: (n: Node, path: string) => void) {
  visit(n, path);
  for (const [k, v] of Object.entries(n.properties ?? {})) walk(v, `${path}.${k}`, visit);
  if (n.items) walk(n.items, `${path}[]`, visit);
}

describe('analiz katı JSON şeması', () => {
  it('strict kuralı: her nesnede bütün alanlar zorunlu, ek alan yok', () => {
    walk(ANALYSIS_JSON_SCHEMA as Node, '$', (n, path) => {
      if (n.type !== 'object') return;
      expect(n.additionalProperties, path).toBe(false);
      expect([...(n.required ?? [])].sort(), path).toEqual(Object.keys(n.properties ?? {}).sort());
    });
    expect(ANALYSIS_RESPONSE_FORMAT.json_schema.strict).toBe(true);
  });

  it('prompt şemasındaki bütün alanlar katı şemada da var', () => {
    const ctx = { match: { home: {}, away: {} }, matchPhase: 'PRE', homeTeam: { metrics: {}, recentMatches: [] }, awayTeam: { metrics: {}, recentMatches: [] }, h2h: null, oddsSignal: { pre: null, live: null, movement: null } } as unknown as MatchAnalysisContext;
    const msg = buildAnalysisUserMessage(ctx);
    const keys: string[] = [];
    walk(ANALYSIS_JSON_SCHEMA as Node, '$', (_n, path) => {
      const k = path.split('.').pop()!.replace('[]', '');
      if (k !== '$') keys.push(k);
    });
    for (const k of new Set(keys)) expect(msg, k).toContain(`"${k}"`);
  });
});
