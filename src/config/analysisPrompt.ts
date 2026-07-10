/**
 * Maç teknik analizi için LLM prompt şablonu (v2 — 11 bölümlük kapsamlı format).
 *
 * Çıktı yapılandırılmış JSON; TÜM metin alanları Türkçe.
 * Narrative bölümleri 1-2 paragraflık akıcı anlatım ister
 * (sadece sayı listelemez — neden/nasıl açıklar).
 */
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

export const ANALYSIS_MODEL_VERSION = 'v2-2026-07';

export const ANALYSIS_SYSTEM_PROMPT = `Sen profesyonel bir futbol veri analisti, iddia analisti ve Opta/Wyscout seviyesinde
maç öncesi analiz uzmanısın. Sana verilen maç verilerini (takım formu, head-to-head,
lig sıralaması, maç istatistikleri, bahis oranları) yorumlayarak kapsamlı teknik analiz,
skor tahmini ve bahis pazarı değerlendirmesi üreteceksin.

KURALLAR:
1. Tüm çıktı metinleri TÜRKÇE olacak (takım/oyuncu adları orijinal kalabilir).
2. Çıktı SADECE geçerli JSON formatında olacak — JSON dışında hiçbir karakter yazma,
   markdown kod bloğu kullanma.
3. "narrative"/"comment" gibi metin alanları akıcı, doğal Türkçe anlatım olacak.
   Sadece sayı listeleme — sayıları cümle içinde gerekçeye dönüştür.
4. Tüm yüzde değerleri 0-100 arası tam sayı (1X2 toplamı 100 olacak).
5. Kesin konuşma, olasılık dili kullan ("muhtemelen", "büyük ihtimalle" gibi).
6. Veri eksikse (kadro/sakatlık/oyuncu formu vb.) bunu açıkça belirt ve hangi
   varsayımla tahmin yaptığını yaz — confidence değerini buna göre düşür.
7. Spekülasyonlardan kaçın: kadro/sakatlık verisi yoksa oyuncu bazlı tahminlerde
   bunu net şekilde ifade et (örn. "kadro verisi yok, genel form üzerinden tahmin").
8. Bahis önerilerinde abartma — düşük güvenli durumlarda "Riskli" işaretle, value
   bulunmuyorsa "avoid: true" işaretle.
9. heatmapAnalysis.zoneGrid.home ve .away alanlarında HER ZAMAN tam 15 sayı ver
   (eksik/fazla eleman bırakma), değerler homeZones/awayZones metniyle tutarlı olsun.
   homeZones/awayZones/narrative alanları SADECE doğal dil metin olmalı — sayı
   dizisini (zoneGrid'i) YANLIŞLIKLA bu metin alanlarına YAZMA.

ÖNEMLİ KALİBRASYON:
- "high" güven sadece veri açıkça tek yönü işaret ederse (örn. ev avantajı + form +
  H2H üçü de aynı tarafta).
- "medium" çoğu durumda varsayılan.
- "low" iki taraf da güçlü/zayıf olduğunda veya veri çelişkili olduğunda.
- riskLevel: tahminin kendine olan güveni değil, BU MAÇIN ne kadar öngörülebilir
  olduğudur. Derbi/eşit takımlar/canlı oran salınımı → high risk.`;

export type AnalysisJsonSchema = {
  /** 1. Genel Maç Özeti */
  matchSummary: {
    tempo: string;
    dominantSide: string;
    balanceType: string;
    homeAwayImpact: string;
  };
  /** 2. Takım Form Analizi */
  teamAnalyses: {
    home: TeamAnalysis;
    away: TeamAnalysis;
  };
  /** 3. Taktik Analiz */
  tacticalAnalysis: {
    home: TacticalProfile;
    away: TacticalProfile;
    keyBattleZones: string;
  };
  /** 4. Isı Haritası ve Saha Hakimiyeti Tahmini */
  heatmapAnalysis: {
    homeZones: string;
    awayZones: string;
    narrative: string;
    /**
     * Görsel ısı haritası için 15 sayılık (3 bölge x 5 kolon) yoğunluk grid'i.
     * Sıra: index = bölge*5 + kolon.
     * Bölge (0-2): 0 = kendi savunma bölgesi, 1 = orta saha, 2 = rakip kaleye yakın hücum bölgesi.
     * Kolon (0-4): 0 = sol kanat, 1 = sol iç (half-space), 2 = merkez, 3 = sağ iç (half-space), 4 = sağ kanat.
     * Değerler 0-100 arası, o takımın topla oynama/aktivite yoğunluğunu temsil eder.
     */
    zoneGrid?: {
      home: number[];
      away: number[];
    };
  };
  /** 7. Maç Sonucu Tahmini */
  matchPrediction: {
    home: number;
    draw: number;
    away: number;
    reasoning: string;
  };
  scorePrediction: {
    mostLikely: string;
    alternatives: Array<{ score: string; probability: number }>;
    reasoning: string;
  };
  /** 6. Gol Tahmini */
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
  /** 8. Bahis / İddia Pazarı Analizi */
  bettingTips: Array<{
    market: string;
    pick: string;
    confidence: 'low' | 'medium' | 'high';
    reasoning: string;
    valueBet: boolean;
    avoid: boolean;
  }>;
  /** 9. Risk Analizi */
  riskLevel: 'low' | 'medium' | 'high';
  riskReasoning: string;
  riskFactors: string[];
  /** 11. Analist Yorumu */
  analystComment: string;
  /** 0-100 arası model güven skoru (tahminin genel kalitesi) */
  overallConfidence: number;
};

type TeamAnalysis = {
  narrative: string;
  keyFactors: string[];
  formSummary: string;
  vsOpponentHistory: string;
  firstHalfNote: string;
  secondHalfNote: string;
};

type TacticalProfile = {
  formation: string;
  pressLevel: string;
  transitionStrength: string;
  setPieceThreat: string;
  wingUsage: string;
  defensiveWeakness: string;
};

const OUTPUT_SCHEMA_DESCRIPTION = `{
  "matchSummary": {
    "tempo": "Maçın temposu nasıl olur (1-2 cümle)",
    "dominantSide": "Hangi takım oyunu domine etmeye daha yakın",
    "balanceType": "Dengeli mi, tek taraflı mı, kaotik mi",
    "homeAwayImpact": "Ev/deplasman etkisi değerlendirmesi"
  },
  "teamAnalyses": {
    "home": {
      "narrative": "1-2 PARAGRAFLIK akıcı anlatım: form, kilit oyuncular, taktik, motivasyon, ev sahibi avantajı",
      "keyFactors": ["3-5 madde, kısa cümleler"],
      "formSummary": "Tek cümle özet (örn: 'Son 5 maçta 3G-1B-1M, 10 gol attı')",
      "vsOpponentHistory": "Tek cümle H2H özeti",
      "firstHalfNote": "İlk yarı performans eğilimi (1 cümle)",
      "secondHalfNote": "İkinci yarı performans eğilimi (1 cümle)"
    },
    "away": { "...aynı yapı..." : "" }
  },
  "tacticalAnalysis": {
    "home": {
      "formation": "Muhtemel diziliş (örn '4-2-3-1')",
      "pressLevel": "Pres seviyesi değerlendirmesi",
      "transitionStrength": "Geçiş oyunu gücü",
      "setPieceThreat": "Duran top tehdidi",
      "wingUsage": "Kanat kullanımı",
      "defensiveWeakness": "Savunma zaafları"
    },
    "away": { "...aynı yapı..." : "" },
    "keyBattleZones": "Hangi takım hangi bölgede üstünlük kurabilir (1-2 cümle)"
  },
  "heatmapAnalysis": {
    "homeZones": "Ev sahibinin en aktif olacağı bölgeler — DOĞAL DİLDE 1 CÜMLE (örn. 'Sağ kanat ve merkez orta sahada yoğunlaşacak'). SAYI DİZİSİ YAZMA — bu alan metin, veri değil.",
    "awayZones": "Deplasmanın en aktif olacağı bölgeler — DOĞAL DİLDE 1 CÜMLE. SAYI DİZİSİ YAZMA — bu alan metin, veri değil.",
    "narrative": "Ceza sahası girişleri, half-space kullanımı, kanat yoğunluğu, merkez kontrolü — sözel ısı haritası tarifi (metin, sayı değil)",
    "zoneGrid": {
      "home": "[SADECE bu alan 15 sayıdan oluşur, 0-100 arası. Sıra: bölge*5+kolon — bölge 0=kendi savunma, 1=orta saha, 2=rakip kaleye yakın hücum; kolon 0=sol kanat, 1=sol iç, 2=merkez, 3=sağ iç, 4=sağ kanat. homeZones/narrative ile TUTARLI olsun (örn. sağ kanat yoğunsa kolon 4 hücreleri yüksek olmalı)]",
      "away": "[Aynı yapı, 15 sayı — awayZones/narrative ile tutarlı]"
    }
  },
  "matchPrediction": {
    "home": 0-100, "draw": 0-100, "away": 0-100,
    "reasoning": "1-2 cümle: neden bu yüzdeler?"
  },
  "scorePrediction": {
    "mostLikely": "X-Y formatında (örn '2-1')",
    "alternatives": [{ "score": "1-1", "probability": 0-100 }, { "score": "2-0", "probability": 0-100 }],
    "reasoning": "1-2 cümle: neden bu skor?"
  },
  "goalExpectation": {
    "over15": 0-100, "over25": 0-100, "over35": 0-100, "btts": 0-100,
    "htOver05": 0-100, "htOver15": 0-100,
    "homeToScore": 0-100, "awayToScore": 0-100, "bttsFirstHalf": 0-100,
    "reasoning": "1-2 cümle: gol beklentisinin gerekçesi"
  },
  "bettingTips": [
    {
      "market": "1X2" | "Çifte Şans" | "Üst/Alt 2.5" | "KG Var/Yok" | "İlk Yarı Üst" | "Korner" | "Kart" | "Skor",
      "pick": "Pazara göre seçim",
      "confidence": "low" | "medium" | "high",
      "reasoning": "1-2 cümle: neden bu tahmin?",
      "valueBet": true veya false,
      "avoid": true veya false
    }
  ],
  "riskLevel": "low" | "medium" | "high",
  "riskReasoning": "Tek cümle: maçın öngörülebilirlik durumu",
  "riskFactors": ["Erken gol senaryosu", "Kırmızı kart senaryosu", "Rotasyon/eksik oyuncu etkisi", "Motivasyon faktörü — 3-5 madde"],
  "analystComment": "3-4 cümlelik Opta analisti tarzı yorum: ana belirleyici faktör, en güçlü sinyal, en büyük belirsizlik, en mantıklı bahis yaklaşımı",
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
      ? 'Bu MAÇ ÖNCESİ analizi. Form, H2H ve oranlara göre kapsamlı bir tahmin yap.'
      : ctx.matchPhase === 'HT'
        ? 'Bu DEVRE ARASI analizi. Maç öncesi tahmin yüzdelerini (home/draw/away) ve skor tahminini KORUYUN — değiştirmeyin. ' +
          'matchPrediction.reasoning alanına kısa bir ilk yarı notu ekle. Diğer tüm alanları maç öncesi bağlama göre doldur.'
        : ctx.matchPhase === 'LIVE'
          ? 'Bu CANLI maç analizi. Mevcut skor ve istatistikleri değerlendir.'
          : 'Bu MAÇ SONU analizi. Sonucu değerlendir, performans yorumla.';

  return `${phaseHint}

${summary}

---

Aşağıdaki başlıkları kapsayan bir maç öncesi analiz üret: (1) Genel Maç Özeti,
(2) Takım Form Analizi, (3) Taktik Analiz, (4) Isı Haritası ve Saha Hakimiyeti Tahmini,
(5) Gol Tahmini, (6) Maç Sonucu Tahmini, (7) Bahis/İddia Pazarı Analizi,
(8) Risk Analizi, (9) Analist Yorumu.

Yukarıdaki verilere dayanarak aşağıdaki JSON yapısında analizini yaz. Sadece JSON yaz, başka hiçbir şey yazma.

${OUTPUT_SCHEMA_DESCRIPTION}`;
}
