/**
 * Maç trivia / fun-facts üretimi için Claude prompt şablonu.
 *
 * Üç bölüm üretir:
 * 1. ertemFacts  — Ertem Şener tarzı absürd ama gerçek istatistikler (3-5 madde)
 * 2. contextual  — Transfer/kariyer bağlam anlatısı (1-2 paragraf)
 * 3. rivalryContext — Tarihi husumeti ve önemli olaylar (1-2 paragraf)
 *
 * Çıktı SADECE JSON. Tüm metinler Türkçe.
 */
import type { MatchAnalysisContext } from '@/server/buildMatchAnalysisContext';

export const TRIVIA_MODEL_VERSION = 'v1-trivia-claude-sonnet-4-5-2026-04';

export const TRIVIA_SYSTEM_PROMPT = `Sen bir futbol trivia ve tarih uzmanısın — özellikle Türk futbolu konusunda derinlemesine bilgi sahibisin.
Verilen maç verisinden üç farklı içerik üreteceksin:

1. "ertemFacts": Ertem Şener tarzı ilginç, absürd ama gerçek futbol istatistikleri.
   - Her madde tek cümle, sürpriz bir gerçek içermeli.
   - Sayısal verileri maç verisinden türet; genel futbol bilginle de destekle.
   - 3-5 madde üret, her biri farklı bir konu (gol, kart, deplasman, seri, derbi vb.).

2. "contextual": Kadroda sahaya çıkacak oyuncuların transfer ve kariyer bağlamı.
   - Sana verilen kadrodaki oyuncu isimlerini tek tek düşün. Türk futbol bilgin çerçevesinde:
     * Eski takımına karşı oynayan var mı? → Adını ve durumu açıkça yaz.
       Örn: "Uğurcan Çakır, Trabzonspor'dan Galatasaray'a geçişinin ardından eski takımına ilk kez deplasmanda karşı geliyor."
     * Rakip takımda eskiden forma giymiş olan var mı? → Belirt.
     * Bu maç için özel motivasyonu olan (borçlu, intikam, ilk maç vb.) bir isim var mı? → Öne çıkar.
   - Eğer kadrodaki oyuncular hakkında SOMUT bir bağlantı biliyorsan kesinlikle yaz — isim ver, durumu açıkla.
   - Eğer kadro verisini göremiyor ya da hiçbir somut bağlantı bulamıyorsan şunu yaz:
     "Bu maçta dikkat çekici bir eski takım bağlantısı bulunmuyor."
   - ASLA "belki transferler yaşanmıştır", "bazı oyuncular olabilir" gibi muğlak ifade kullanma.
     Ya somut isim ver, ya da yok de.

3. "rivalryContext": Bu iki takım arasındaki tarihsel rekabet, husumeti ve ikonik anlar.
   - Taraftar perspektifinden tarihi olayları, ikonik maçları, şampiyonluk mücadelelerini anlat.
   - Varsa bilinen kırmızı kart olayları, tartışmalı kararlar, galibiyet serileri gibi olgulara değin.
   - 1-2 paragraflık akıcı Türkçe anlatım.

KURALLAR:
1. Çıktı SADECE geçerli JSON formatında — markdown kod bloğu kullanma, JSON dışında karakter yazma.
2. Tüm metinler TÜRKÇE (takım/oyuncu adları orijinal kalabilir).
3. "contextual" için: somut bilgi varsa yaz, yoksa açıkça "bağlantı yok" de. Muğlaklık yasak.
4. "ertemFacts" dizisi içindeki her eleman kısa, vurucu, tek cümle olmalı.`;

export type TriviaJsonSchema = {
  ertemFacts: string[];
  contextual: string;
  rivalryContext: string;
};

const OUTPUT_SCHEMA_DESCRIPTION = `{
  "ertemFacts": [
    "3-5 madde — her biri absürd ama gerçek tek cümle istatistik",
    "Örn: 'Bu iki takım son 5 karşılaşmasının tamamında en az 3 gol çıkardı.'",
    "Örn: 'Galatasaray bu statta son 8 maçında hiç beraberlik görmedi.'"
  ],
  "contextual": "1-2 paragraf. Transfer/kariyer bağlamı: eski takımına karşı oynayan oyuncular, önemli dönüm noktaları, sahada ilk buluşmalar vb.",
  "rivalryContext": "1-2 paragraf. Tarihi husumeti, ikonik maçlar, şampiyonluk kavgaları, taraftar rekabeti vb."
}`;

function buildLineupSection(ctx: MatchAnalysisContext): string {
  const lines: string[] = [];

  // Gerçek yapı: lineups.lineup.home.players[] / lineups.lineup.away.players[]
  // Başlangıç oyuncuları: player.substitution === '0'
  type RawPlayer = { name?: string; number?: number | string; substitution?: string };
  type RawSide = { team?: { name?: string }; players?: RawPlayer[] };
  const lineups = ctx.lineups as { lineup?: { home?: RawSide; away?: RawSide } } | null | undefined;

  const homeData = lineups?.lineup?.home;
  const awayData = lineups?.lineup?.away;

  const homeStarters = (homeData?.players ?? []).filter((p) => p.substitution === '0');
  const awayStarters = (awayData?.players ?? []).filter((p) => p.substitution === '0');

  if (homeStarters.length > 0) {
    const homeName = homeData?.team?.name ?? ctx.match.home?.name ?? 'Ev Sahibi';
    lines.push(`\n## ${homeName} İlk 11 (sahaya çıkacak oyuncular)`);
    lines.push(homeStarters.map((p) => p.name ?? 'Bilinmiyor').join(', '));
  }

  if (awayStarters.length > 0) {
    const awayName = awayData?.team?.name ?? ctx.match.away?.name ?? 'Deplasman';
    lines.push(`\n## ${awayName} İlk 11 (sahaya çıkacak oyuncular)`);
    lines.push(awayStarters.map((p) => p.name ?? 'Bilinmiyor').join(', '));
  }

  if (homeStarters.length === 0 && awayStarters.length === 0) {
    lines.push('\n## Kadro: Henüz açıklanmadı');
  }

  return lines.join('\n');
}

function buildTriviaContext(ctx: MatchAnalysisContext): string {
  const m = ctx.match;
  const homeName = m.home?.name ?? 'Ev sahibi';
  const awayName = m.away?.name ?? 'Deplasman';
  const compName = m.competition?.name ?? 'Bilinmeyen lig';

  const lines: string[] = [];
  lines.push(`# Maç: ${homeName} vs ${awayName}`);
  lines.push(`Lig: ${compName} | Tarih: ${m.date ?? 'bilinmiyor'}`);

  const h = ctx.homeTeam;
  const a = ctx.awayTeam;

  lines.push(`\n## ${homeName} Son Form`);
  lines.push(`${h.metrics.wins}G-${h.metrics.draws}B-${h.metrics.losses}M | Maç başına ${h.metrics.goalsPerMatch} gol`);
  lines.push(`Temiz kale: %${Math.round(h.metrics.cleanSheetRate * 100)} | KG var: %${Math.round(h.metrics.bttsRate * 100)}`);
  lines.push(`Son maçlar: ${h.recentMatches.slice(0, 5).map((r) => `${r.result}(${r.scoreText})`).join(', ')}`);

  lines.push(`\n## ${awayName} Son Form`);
  lines.push(`${a.metrics.wins}G-${a.metrics.draws}B-${a.metrics.losses}M | Maç başına ${a.metrics.goalsPerMatch} gol`);
  lines.push(`Temiz kale: %${Math.round(a.metrics.cleanSheetRate * 100)} | KG var: %${Math.round(a.metrics.bttsRate * 100)}`);
  lines.push(`Son maçlar: ${a.recentMatches.slice(0, 5).map((r) => `${r.result}(${r.scoreText})`).join(', ')}`);

  if (ctx.h2h && ctx.h2h.totalMatches > 0) {
    lines.push(`\n## Head-to-Head`);
    lines.push(`Toplam ${ctx.h2h.totalMatches} maç: ${homeName} ${ctx.h2h.homeWins}G - ${ctx.h2h.draws}B - ${ctx.h2h.awayWins}M ${awayName}`);
    lines.push(`Goller: ${homeName} ${ctx.h2h.goalsHome} - ${ctx.h2h.goalsAway} ${awayName}`);
    if (ctx.h2h.last3.length) {
      lines.push(`Son 3 karşılaşma: ${ctx.h2h.last3.map((r) => `${r.homeTeam} ${r.score} ${r.awayTeam} (${r.date})`).join(' | ')}`);
    }
  }

  lines.push(buildLineupSection(ctx));

  return lines.join('\n');
}

export function buildTriviaUserMessage(ctx: MatchAnalysisContext): string {
  const contextSummary = buildTriviaContext(ctx);

  return `${contextSummary}

---

Yukarıdaki maç verilerini kullanarak aşağıdaki JSON yapısında trivia içeriği üret.
Sadece JSON yaz, başka hiçbir şey yazma.

${OUTPUT_SCHEMA_DESCRIPTION}`;
}
