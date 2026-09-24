// AI analiz API yanıt tipleri — hook (useMatchAnalysis) ve bileşen ortak kullanır.

export type TacticalProfile = {
  formation: string;
  pressLevel: string;
  transitionStrength: string;
  setPieceThreat: string;
  wingUsage: string;
  defensiveWeakness: string;
};

export type FullReport = {
  matchSummary: { tempo: string; dominantSide: string; balanceType: string; homeAwayImpact: string };
  tacticalAnalysis: { home: TacticalProfile; away: TacticalProfile; keyBattleZones: string };
  heatmapAnalysis: {
    // Model bazen (talimata rağmen) bu alanlara metin yerine sayı dizisi
    // yazabiliyor — render'da güvenli tarafta kalmak için unknown tutuyoruz.
    homeZones: unknown;
    awayZones: unknown;
    narrative: unknown;
    zoneGrid?: { home: number[]; away: number[] };
  };
  riskFactors: string[];
  analystComment: string;
};

export type ApiAnalysis = {
  id: string;
  matchId: string;
  matchStatus: string;
  homeTeamName: string;
  awayTeamName: string;
  matchPrediction: { home: number; draw: number; away: number; reasoning: string };
  scorePrediction: {
    mostLikely: string;
    alternatives: Array<{ score: string; probability: number } | string>;
    reasoning: string;
  };
  goalExpectation: {
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    htOver05: number;
    htOver15: number;
    homeToScore: number;
    awayToScore: number;
    bttsFirstHalf: number;
    reasoning: string;
  };
  bettingTips: Array<{
    market: string;
    pick: string;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
    valueBet?: boolean;
    avoid?: boolean;
  }>;
  teamAnalyses: {
    home: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
      firstHalfNote?: string;
      secondHalfNote?: string;
    };
    away: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
      firstHalfNote?: string;
      secondHalfNote?: string;
    };
  };
  fullReport: FullReport | null;
  riskLevel: 'low' | 'medium' | 'high';
  riskReasoning: string;
  confidenceScore: number;
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type ApiPredictionRecord = {
  id: string;
  actualResult: string | null;
  actualScore: string | null;
  result1x2Hit: boolean | null;
  scoreExactHit: boolean | null;
  evaluatedAt: string | null;
  extendedHits: Record<string, boolean | null> | null;
};
