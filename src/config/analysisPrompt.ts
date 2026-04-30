/**
 * Maç teknik analizi için Claude prompt şablonu.
 *
 * Çıktı yapılandırılmış JSON; TÜM metin alanları Türkçe.
 * Narrative bölümleri 1-2 paragraflık akıcı anlatım ister
 * (sadece sayı listelemez — neden/nasıl açıklar).
 */
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

export const ANALYSIS_MODEL_VERSION = 'v1-claude-sonnet-4-5-2026-04';

export const ANALYSIS_SYSTEM_PROMPT = `Sen profesyonel bir futbol analisti, istatistikçi ve bahis stratejistisin.
Sana verilen maç verilerini (takım formu, head-to-head, lig sıralaması, maç istatistikleri,
bahis oranları) yorumlayarak teknik analiz, skor tahmini ve bahis tavsiyeleri üreteceksin.

KURALLAR:
1. Tüm çıktı metinleri TÜRKÇE olacak (takım/oyuncu adları orijinal kalabilir).
2. Çıktı SADECE geçerli JSON formatında olacak — JSON dışında hiçbir karakter yazma,
   markdown kod bloğu kullanma.
3. "narrative" alanları 1-2 paragraflık, akıcı, doğal Türkçe anlatım olacak.
   "Galatasaray'ın son dönemlerdeki performansından dolayı..." gibi insan dilinde yaz.
   Sadece sayı listeleme — sayıları cümle içinde gerekçeye dönüştür.
4. Tüm yüzde değerleri 0-100 arası tam sayı (1X2 toplamı 100 olacak).
5. Veri eksikse "data yetersiz" deme, elindeki verilerle en iyi tahmini üret ve
   confidence değerini düşür.
6. Spekülasyonlardan kaçın: kadro/sakatlık verisi yoksa o konuda yorum yapma.
7. Bahis önerilerinde abartma — düşük güvenli durumlarda "Riskli" işaretle.

ÖNEMLİ KALİBRASYON:
- "high" güven sadece veri açıkça tek yönü işaret ederse (örn. ev avantajı + form +
  H2H üçü de aynı tarafta).
- "medium" çoğu durumda varsayılan.
- "low" iki taraf da güçlü/zayıf olduğunda veya veri çelişkili olduğunda.
- riskLevel: tahminin kendine olan güveni değil, BU MAÇIN ne kadar öngörülebilir
  olduğudur. Derbi/eşit takımlar/canlı oran salınımı → high risk.`;

export type AnalysisJsonSchema = {
  matchPrediction: {
    home: number;
    draw: number;
    away: number;
    reasoning: string;
  };
  teamAnalyses: {
    home: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
    };
    away: {
      narrative: string;
      keyFactors: string[];
      formSummary: string;
      vsOpponentHistory: string;
    };
  };
  scorePrediction: {
    mostLikely: string;
    alternatives: string[];
    reasoning: string;
  };
  goalExpectation: {
    over15: number;
    over25: number;
    over35: number;
    btts: number;
    reasoning: string;
  };
  bettingTips: Array<{
    market: string;
    pick: string;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
  }>;
  riskLevel: 'low' | 'medium' | 'high';
  riskReasoning: string;
  /** 0-100 arası model güven skoru (tahminin genel kalitesi) */
  overallConfidence: number;
};

const OUTPUT_SCHEMA_DESCRIPTION = `{
  "matchPrediction": {
    "home": 0-100, "draw": 0-100, "away": 0-100,
    "reasoning": "1-2 cümle: neden bu yüzdeler?"
  },
  "teamAnalyses": {
    "home": {
      "narrative": "1-2 PARAGRAFLIK akıcı anlatım. Form, kilit oyuncular, taktik, motivasyon, ev sahibi avantajı vb.",
      "keyFactors": ["3-5 madde, kısa cümleler"],
      "formSummary": "Tek cümle özet (örn: 'Son 5 maçta 3G-1B-1M, 10 gol attı')",
      "vsOpponentHistory": "Tek cümle (örn: 'Son 3 maçta 2-0-1, rakibe karşı baskın')"
    },
    "away": { ... aynı yapı ... }
  },
  "scorePrediction": {
    "mostLikely": "X-Y formatında (örn '2-1')",
    "alternatives": ["2 alternatif skor"],
    "reasoning": "1-2 cümle: neden bu skor?"
  },
  "goalExpectation": {
    "over15": 0-100, "over25": 0-100, "over35": 0-100, "btts": 0-100,
    "reasoning": "1-2 cümle: gol beklentisinin gerekçesi"
  },
  "bettingTips": [
    {
      "market": "1X2" | "Üst/Alt 2.5" | "KG Var/Yok" | "Çifte Şans" | "Skor",
      "pick": "Pazara göre seçim (örn '1', 'Üst', 'KG Var', '1X', '2-1')",
      "confidence": "low" | "medium" | "high",
      "reasoning": "1-2 cümle: neden bu tahmin?"
    }
  ],
  "riskLevel": "low" | "medium" | "high",
  "riskReasoning": "Tek cümle: maçın öngörülebilirlik durumu",
  "overallConfidence": 0-100
}`;

function summarizeContextForPrompt(ctx: MatchAnalysisContext): string {
  const m = ctx.match;
  const homeName = m.home?.name ?? 'Ev sahibi';
  const awayName = m.away?.name ?? 'Deplasman';
  const compName = m.competition?.name ?? 'Bilinmeyen lig';
  const date = m.date ?? 'tarih bilinmiyor';
  const phaseLabel: Record<MatchAnalysisContext['matchPhase'], string> = {
    PRE: 'Maç henüz başlamadı',
    LIVE: 'Maç şu an oynanıyor',
    HT: 'Devre arası',
    POST: 'Maç bitti',
  };

  const lines: string[] = [];
  lines.push(`# Maç: ${homeName} vs ${awayName}`);
  lines.push(`Lig: ${compName} | Tarih: ${date} | Durum: ${phaseLabel[ctx.matchPhase]}`);
  if (m.scores?.score) {
    lines.push(`Mevcut skor: ${m.scores.score}${m.scores.ht_score ? ` (İY: ${m.scores.ht_score})` : ''}`);
  }
  if (m.referee) lines.push(`Hakem: ${m.referee}`);
  if (m.location) lines.push(`Stadyum: ${m.location}`);

  // Ev sahibi takım
  lines.push(`\n## ${homeName} (Ev Sahibi)`);
  const h = ctx.homeTeam;
  lines.push(`Son ${h.metrics.matchesAnalyzed} maç: ${h.metrics.wins}G-${h.metrics.draws}B-${h.metrics.losses}M`);
  lines.push(`Maç başına: ${h.metrics.goalsPerMatch} gol attı, ${h.metrics.goalsAgainstPerMatch} yedi`);
  lines.push(`Temiz kale oranı: %${Math.round(h.metrics.cleanSheetRate * 100)} | KG var: %${Math.round(h.metrics.bttsRate * 100)}`);
  lines.push(`Ev galibiyet oranı: %${Math.round(h.metrics.homeWinRate * 100)} | Deplasman: %${Math.round(h.metrics.awayWinRate * 100)}`);
  lines.push(`Form trendi: ${h.metrics.formTrend === 'rising' ? 'YÜKSELEN ↑' : h.metrics.formTrend === 'falling' ? 'DÜŞEN ↓' : 'STABİL →'}`);
  if (h.standingRow) {
    lines.push(`Lig sırası: ${h.standingRow.rank}. (${h.standingRow.points} puan, averaj ${h.standingRow.goal_diff})`);
  }
  lines.push(`Son maçlar (yeni → eski):`);
  for (const r of h.recentMatches.slice(0, 8)) {
    lines.push(`  - ${r.date} ${r.isHome ? 'EV' : 'DEP'} vs ${r.opponent}: ${r.scoreText} (${r.result})`);
  }

  // Deplasman takım
  lines.push(`\n## ${awayName} (Deplasman)`);
  const a = ctx.awayTeam;
  lines.push(`Son ${a.metrics.matchesAnalyzed} maç: ${a.metrics.wins}G-${a.metrics.draws}B-${a.metrics.losses}M`);
  lines.push(`Maç başına: ${a.metrics.goalsPerMatch} gol attı, ${a.metrics.goalsAgainstPerMatch} yedi`);
  lines.push(`Temiz kale oranı: %${Math.round(a.metrics.cleanSheetRate * 100)} | KG var: %${Math.round(a.metrics.bttsRate * 100)}`);
  lines.push(`Ev galibiyet oranı: %${Math.round(a.metrics.homeWinRate * 100)} | Deplasman: %${Math.round(a.metrics.awayWinRate * 100)}`);
  lines.push(`Form trendi: ${a.metrics.formTrend === 'rising' ? 'YÜKSELEN ↑' : a.metrics.formTrend === 'falling' ? 'DÜŞEN ↓' : 'STABİL →'}`);
  if (a.standingRow) {
    lines.push(`Lig sırası: ${a.standingRow.rank}. (${a.standingRow.points} puan, averaj ${a.standingRow.goal_diff})`);
  }
  lines.push(`Son maçlar (yeni → eski):`);
  for (const r of a.recentMatches.slice(0, 8)) {
    lines.push(`  - ${r.date} ${r.isHome ? 'EV' : 'DEP'} vs ${r.opponent}: ${r.scoreText} (${r.result})`);
  }

  // H2H
  if (ctx.h2h && ctx.h2h.totalMatches > 0) {
    lines.push(`\n## Head-to-Head (Ev sahibi perspektifinden)`);
    lines.push(`Toplam ${ctx.h2h.totalMatches} maç: ${homeName} ${ctx.h2h.homeWins}G - ${ctx.h2h.draws}B - ${ctx.h2h.awayWins}M ${awayName}`);
    lines.push(`Goller: ${homeName} ${ctx.h2h.goalsHome} - ${ctx.h2h.goalsAway} ${awayName}`);
    lines.push(`Dominans skoru: ${ctx.h2h.homeDominance} (-1 deplasman lehine, +1 ev lehine)`);
    if (ctx.h2h.last3.length) {
      lines.push(`Son 3 karşılaşma:`);
      for (const r of ctx.h2h.last3) {
        lines.push(`  - ${r.date}: ${r.homeTeam} ${r.score} ${r.awayTeam}`);
      }
    }
  } else {
    lines.push(`\n## Head-to-Head: Veri yok veya yetersiz`);
  }

  // Bahis oranları sinyali
  if (ctx.oddsSignal.pre) {
    lines.push(`\n## Bahis Oranları`);
    lines.push(`Açılış (Pre): 1=${ctx.oddsSignal.pre['1'] ?? '-'} | X=${ctx.oddsSignal.pre.X ?? '-'} | 2=${ctx.oddsSignal.pre['2'] ?? '-'}`);
    if (ctx.oddsSignal.live) {
      lines.push(`Güncel (Live): 1=${ctx.oddsSignal.live['1'] ?? '-'} | X=${ctx.oddsSignal.live.X ?? '-'} | 2=${ctx.oddsSignal.live['2'] ?? '-'}`);
      if (ctx.oddsSignal.movement && ctx.oddsSignal.movement !== 'stable') {
        const labelMap = { home: 'Ev sahibi', draw: 'Beraberlik', away: 'Deplasman' };
        lines.push(`Piyasa hareketi: ${labelMap[ctx.oddsSignal.movement]} yönünde para akışı (oran düşüyor)`);
      }
    }
  }

  // Devre arası / canlı istatistikler
  if (ctx.liveStats && (ctx.matchPhase === 'LIVE' || ctx.matchPhase === 'HT' || ctx.matchPhase === 'POST')) {
    lines.push(`\n## Maç İçi İstatistikler (Ev:Deplasman)`);
    const s = ctx.liveStats;
    if (s.possesion) lines.push(`Topla oynama: ${s.possesion}`);
    if (s.shots_on_target) lines.push(`İsabetli şut: ${s.shots_on_target}`);
    if (s.shots_off_target) lines.push(`İsabetsiz şut: ${s.shots_off_target}`);
    if (s.attempts_on_goal) lines.push(`Toplam şut: ${s.attempts_on_goal}`);
    if (s.corners) lines.push(`Korner: ${s.corners}`);
    if (s.dangerous_attacks) lines.push(`Tehlikeli atak: ${s.dangerous_attacks}`);
    if (s.yellow_cards) lines.push(`Sarı kart: ${s.yellow_cards}`);
    if (s.red_cards) lines.push(`Kırmızı kart: ${s.red_cards}`);
  }

  return lines.join('\n');
}

export function buildAnalysisUserMessage(ctx: MatchAnalysisContext): string {
  const summary = summarizeContextForPrompt(ctx);
  const phaseHint =
    ctx.matchPhase === 'PRE'
      ? 'Bu MAÇ ÖNCESİ analizi. Form, H2H ve oranlara göre tahmin yap.'
      : ctx.matchPhase === 'HT'
        ? 'Bu DEVRE ARASI analizi. İlk yarı istatistiklerini de değerlendir; ikinci yarı için tahmin yap.'
        : ctx.matchPhase === 'LIVE'
          ? 'Bu CANLI maç analizi. Mevcut skor ve istatistikleri değerlendir.'
          : 'Bu MAÇ SONU analizi. Sonucu değerlendir, performans yorumla.';

  return `${phaseHint}

${summary}

---

Yukarıdaki verilere dayanarak aşağıdaki JSON yapısında analizini yaz. Sadece JSON yaz, başka hiçbir şey yazma.

${OUTPUT_SCHEMA_DESCRIPTION}`;
}
