/**
 * Maç teknik analizi için LLM prompt şablonu (v2 — 11 bölümlük kapsamlı format).
 *
 * Çıktı yapılandırılmış JSON; TÜM metin alanları Türkçe.
 * Narrative bölümleri 1-2 paragraflık akıcı anlatım ister
 * (sadece sayı listelemez — neden/nasıl açıklar).
 */
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';
import type { LineupPlayer } from '@/models/domain';
import type { AnalysisScenario } from '@/utils/analysisScenarios';
import { impliedProbabilities } from '@/utils/impliedProbability';

// v3: bahis dili yasak, "Bahis / İddia Pazarı" → olasılık senaryoları (AdSense kumar politikası).
export const ANALYSIS_MODEL_VERSION = 'v4-2026-10';

export const ANALYSIS_SYSTEM_PROMPT = `Sen profesyonel bir futbol veri analisti ve Opta/Wyscout seviyesinde maç öncesi
analiz uzmanısın. Sana verilen maç verilerini (takım formu, head-to-head, lig sıralaması,
sakat/cezalı oyuncular, muhtemel ya da resmî ilk 11, maç istatistikleri, dış kaynaklı sonuç
beklentisi) yorumlayarak kapsamlı teknik analiz,
skor tahmini ve istatistiksel olasılık senaryoları üreteceksin.

KURALLAR:
1. Tüm çıktı metinleri TÜRKÇE olacak (takım/oyuncu adları orijinal kalabilir).
2. Çıktı SADECE geçerli JSON formatında olacak — JSON dışında hiçbir karakter yazma,
   markdown kod bloğu kullanma.
3. "narrative"/"comment" gibi metin alanları akıcı, doğal Türkçe anlatım olacak.
   Sadece sayı listeleme — sayıları cümle içinde gerekçeye dönüştür.
4. Tüm yüzde değerleri 0-100 arası tam sayı (ev sahibi / beraberlik / deplasman toplamı 100 olacak).
5. Kesin konuşma, olasılık dili kullan ("muhtemelen", "büyük ihtimalle" gibi).
6. Bağlamda "Eksikler" ya da "İlk 11 / Muhtemel 11" bölümü varsa bunları analize kat: önemli
   eksikleri (ligde çok maç oynamış, gol/asist katkısı yüksek ya da kilit mevkideki oyuncular)
   ve bunların takıma olası etkisini somut yaz; dönüş tarihi maçtan sonraysa oyuncu bu maçta yok
   sayılır. Muhtemel 11 resmî değildir — "muhtemel" diye an.
7. Bağlamda OLMAYAN bir veri hakkında yorum yapma ve eksikliğinden söz etme: "kadro verisi yok",
   "bilgi bulunmadığından", "veri paylaşılmadığından" gibi ifadeler KULLANMA. O alanı eldeki
   verilerle (form, gol ortalamaları, H2H, sıralama, eksikler) doldur. Bağlamda adı geçmeyen
   oyuncu adı UYDURMA. Belirsizliği yalnız confidence değeriyle yansıt.
8. DİL YASAĞI — çıktının HİÇBİR alanında bahis dili kullanma. Yasak: "bahis", "iddaa",
   "iddia pazarı", "kupon", "banko", "value", "oran" (her anlamda; yerine "yüzde" ya da
   "olasılık"), "piyasa", "para akışı", "üst/alt", "KG var/yok", "MS 1/X/2", "1X2".
   Olayları istatistik diliyle yaz ("2+ gol", "iki takım da gol atar", "ilk yarıda gol",
   "ev sahibi kazanır") ve olasılığı yüzde ver ("%58"). Senaryolarda abartma — veri zayıfsa
   confidence "low".
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
  olduğudur. Derbi/eşit takımlar/dış beklentide ani değişim → high risk.`;

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
  /** 8. Olasılık Senaryoları (DB'de `bettingTips` sütununda saklanır, bkz. utils/analysisScenarios.ts) */
  scenarios: AnalysisScenario[];
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
  "scenarios": [
    {
      "metric": "İstatistik dilinde olay — örn. '2+ gol', '3+ gol', 'İki takım da gol atar', 'İlk yarıda gol', 'Ev sahibi kazanır', 'Beraberlik', '9+ korner', '4+ sarı kart'",
      "probability": 0-100,
      "confidence": "low" | "medium" | "high",
      "reasoning": "1-2 cümle: veriye dayalı gerekçe"
    }
  ],
  "riskLevel": "low" | "medium" | "high",
  "riskReasoning": "Tek cümle: maçın öngörülebilirlik durumu",
  "riskFactors": ["Erken gol senaryosu", "Kırmızı kart senaryosu", "Rotasyon/eksik oyuncu etkisi", "Motivasyon faktörü — 3-5 madde"],
  "analystComment": "3-4 cümlelik Opta analisti tarzı yorum: ana belirleyici faktör, en güçlü sinyal, en büyük belirsizlik, en olası senaryo",
  "overallConfidence": 0-100
}`;

const ABSENCE_KIND_TR: Record<string, string> = { injury: 'sakat', suspended: 'cezalı', other: 'forma giyemiyor' };
const MAX_ABSENCES = 10;

/** Takımın maç günündeki sakat/cezalıları; veri alınamadıysa (`null`) hiç satır yok — model eksikliği bilmez. */
function absenceLines(team: MatchAnalysisContext['homeTeam']): string[] {
  const list = team.absences;
  if (list == null) return [];
  if (list.length === 0) return ['Eksikler: bilinen sakat/cezalı oyuncu yok'];
  const sorted = [...list].sort(
    (a, b) => (b.apps ?? 0) - (a.apps ?? 0) || (b.goals ?? 0) + (b.assists ?? 0) - ((a.goals ?? 0) + (a.assists ?? 0)),
  );
  const lines = ['Eksikler (maç günü itibarıyla sakat/cezalı; katkı = ligde bu sezon):'];
  for (const p of sorted.slice(0, MAX_ABSENCES)) {
    const who = p.position ? `${p.name} (${p.position})` : p.name;
    const until = p.until ? `, dönüş tahmini ${p.until}` : '';
    const contrib = p.apps ? ` · ${p.apps} maç, ${p.goals ?? 0} gol, ${p.assists ?? 0} asist` : ' · bu sezon ligde forma giymedi';
    lines.push(`  - ${who} — ${ABSENCE_KIND_TR[p.kind] ?? p.kind}: ${p.reason}${until}${contrib}`);
  }
  if (sorted.length > MAX_ABSENCES) lines.push(`  - (+${sorted.length - MAX_ABSENCES} oyuncu daha)`);
  return lines;
}

/** İlk 11'deki dizilim satırlarından diziliş ("4-2-3-1"); satır bilgisi yoksa null. */
function formationOf(starters: LineupPlayer[]): string | null {
  const rows = new Map<number, number>();
  for (const p of starters) if (p.formation_row != null && p.formation_row > 1) rows.set(p.formation_row, (rows.get(p.formation_row) ?? 0) + 1);
  if (rows.size < 2) return null;
  const counts = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n);
  return counts.reduce((a, b) => a + b, 0) === 10 ? counts.join('-') : null;
}

/** Muhtemel/resmî ilk 11; kadro yoksa hiç satır yok. */
function lineupLines(ctx: MatchAnalysisContext): string[] {
  const lu = ctx.lineups?.lineup;
  if (!lu) return [];
  const teams = [
    { side: lu.home, absences: ctx.homeTeam.absences },
    { side: lu.away, absences: ctx.awayTeam.absences },
  ].map(({ side, absences }) => ({
    name: side?.team?.name ?? '',
    starters: (side?.players ?? []).filter((p) => p.substitution === '0'),
    out: new Set((absences ?? []).map((a) => String(a.playerId))),
  }));
  if (teams.every((t) => t.starters.length === 0)) return [];
  const label =
    ctx.lineups?.confirmed === true ? 'İlk 11 (resmî)' : ctx.lineups?.confirmed === false ? 'Muhtemel 11 (resmî değil, tahmini)' : 'İlk 11';
  const lines = [`\n## ${label}`];
  for (const t of teams) {
    if (t.starters.length === 0) continue;
    const f = formationOf(t.starters);
    let flagged = 0;
    const players = t.starters.map((p) => {
      const base = p.pos_code || p.position ? `${p.name} (${p.pos_code || p.position})` : p.name;
      if (!t.out.has(p.id)) return base;
      flagged++;
      return `${base} [Eksikler listesinde]`;
    });
    lines.push(`${t.name}${f ? ` (${f})` : ''}: ${players.join(', ')}`);
    if (flagged > 0 && ctx.lineups?.confirmed !== true) {
      lines.push(`  Not: [Eksikler listesinde] işaretli oyuncu tahmini kadroda görünse de sakat/cezalı kaydı sürüyor — muhtemelen oynamayacak.`);
    }
  }
  return lines;
}

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
  lines.push(`Gol yemediği maç: %${Math.round(h.metrics.cleanSheetRate * 100)} | İki takımın da gol attığı maç: %${Math.round(h.metrics.bttsRate * 100)}`);
  lines.push(`Evde kazandığı maç: %${Math.round(h.metrics.homeWinRate * 100)} | Deplasmanda: %${Math.round(h.metrics.awayWinRate * 100)}`);
  lines.push(`Form trendi: ${h.metrics.formTrend === 'rising' ? 'YÜKSELEN ↑' : h.metrics.formTrend === 'falling' ? 'DÜŞEN ↓' : 'STABİL →'}`);
  if (h.standingRow) {
    lines.push(`Lig sırası: ${h.standingRow.rank}. (${h.standingRow.points} puan, averaj ${h.standingRow.goal_diff})`);
  }
  lines.push(`Son maçlar (yeni → eski):`);
  for (const r of h.recentMatches.slice(0, 8)) {
    lines.push(`  - ${r.date} ${r.isHome ? 'EV' : 'DEP'} vs ${r.opponent}: ${r.scoreText} (${r.result})`);
  }
  lines.push(...absenceLines(h));

  // Deplasman takım
  lines.push(`\n## ${awayName} (Deplasman)`);
  const a = ctx.awayTeam;
  lines.push(`Son ${a.metrics.matchesAnalyzed} maç: ${a.metrics.wins}G-${a.metrics.draws}B-${a.metrics.losses}M`);
  lines.push(`Maç başına: ${a.metrics.goalsPerMatch} gol attı, ${a.metrics.goalsAgainstPerMatch} yedi`);
  lines.push(`Gol yemediği maç: %${Math.round(a.metrics.cleanSheetRate * 100)} | İki takımın da gol attığı maç: %${Math.round(a.metrics.bttsRate * 100)}`);
  lines.push(`Evde kazandığı maç: %${Math.round(a.metrics.homeWinRate * 100)} | Deplasmanda: %${Math.round(a.metrics.awayWinRate * 100)}`);
  lines.push(`Form trendi: ${a.metrics.formTrend === 'rising' ? 'YÜKSELEN ↑' : a.metrics.formTrend === 'falling' ? 'DÜŞEN ↓' : 'STABİL →'}`);
  if (a.standingRow) {
    lines.push(`Lig sırası: ${a.standingRow.rank}. (${a.standingRow.points} puan, averaj ${a.standingRow.goal_diff})`);
  }
  lines.push(`Son maçlar (yeni → eski):`);
  for (const r of a.recentMatches.slice(0, 8)) {
    lines.push(`  - ${r.date} ${r.isHome ? 'EV' : 'DEP'} vs ${r.opponent}: ${r.scoreText} (${r.result})`);
  }
  lines.push(...absenceLines(a));

  lines.push(...lineupLines(ctx));

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

  // Dış kaynaklı sonuç beklentisi: oran sayıları yerine yüzde (model çıktıya bahis dilini taşımasın).
  const pre = impliedProbabilities(ctx.oddsSignal.pre);
  if (pre) {
    lines.push(`\n## Dış Kaynaklı Sonuç Beklentisi`);
    lines.push(`Maç öncesi: Ev sahibi %${pre.home} | Beraberlik %${pre.draw} | Deplasman %${pre.away}`);
    const live = impliedProbabilities(ctx.oddsSignal.live);
    if (live) {
      lines.push(`Güncel: Ev sahibi %${live.home} | Beraberlik %${live.draw} | Deplasman %${live.away}`);
      if (ctx.oddsSignal.movement && ctx.oddsSignal.movement !== 'stable') {
        const labelMap = { home: 'ev sahibi', draw: 'beraberlik', away: 'deplasman' };
        lines.push(`Beklenti maç yaklaştıkça ${labelMap[ctx.oddsSignal.movement]} lehine kaydı`);
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
      ? 'Bu MAÇ ÖNCESİ analizi. Form, H2H ve dış beklentiye göre kapsamlı bir tahmin yap.'
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
(5) Gol Tahmini, (6) Maç Sonucu Tahmini, (7) Olasılık Senaryoları (3-5 senaryo),
(8) Risk Analizi, (9) Analist Yorumu.

Yukarıdaki verilere dayanarak aşağıdaki JSON yapısında analizini yaz. Sadece JSON yaz, başka hiçbir şey yazma.

${OUTPUT_SCHEMA_DESCRIPTION}`;
}
