import { describe, expect, it } from 'vitest';
import { ANALYSIS_OPENAI_MODEL, openAiAnalysisParams } from './aiAnalysisService';

describe('analiz modeli kodda sabit', () => {
  it('varsayılan gpt-6-luna; OPENAI_MODEL (trivia/video) analizi etkilemez', () => {
    expect(ANALYSIS_OPENAI_MODEL).toBe('gpt-6-luna');
  });

  it('reasoning none yalnız destekleyen modellere gider', () => {
    expect(openAiAnalysisParams('gpt-6-luna')).toEqual({ temperature: 0.35, reasoning_effort: 'none' });
    expect(openAiAnalysisParams('gpt-5.6-luna')).toEqual({ temperature: 0.35, reasoning_effort: 'none' });
    expect(openAiAnalysisParams('gpt-4.1')).toEqual({ temperature: 0.35 });
    expect(openAiAnalysisParams('gpt-6.1-sol')).toEqual({ temperature: 0.35 });
  });
});
