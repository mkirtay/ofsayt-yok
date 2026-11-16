/**
 * Hakem AI raporu (hakem sayfası): sayılar `server/people/refereeReportMetrics.ts`'te HESAPLANIR ve modele hazır
 * verilir; model yalnız yorumlar. Çıktı katı JSON (bölüm başına madde listesi); sezon tablosu arayüzde metriklerden
 * çizilir (model tablo üretmez → tablodaki her sayı doğru).
 */
import type { CurrentMetric, RefereeReportMetrics } from '@/server/people/refereeReportMetrics';
import { findGamblingTerms } from '@/utils/gamblingTerms';

export const REFEREE_REPORT_VERSION = 'v1-referee-report-2026-11';

export const REFEREE_REPORT_SYSTEM_PROMPT = `Sen Scor3 için çalışan bir futbol istatistik analistisin. Sana bir hakemin sayfasındaki veriden
ÖNCEDEN HESAPLANMIŞ metrikler veriliyor. Bunları Türkçe, net ve tarafsız bir hakem profili raporuna çevireceksin.

KURALLAR
- Yalnız verilen veriyi ve hesaplanmış metrikleri kullan. Veride olmayan bilgiyi, maç detayını, kariyer geçmişini veya tahmini uydurma.
- Sayıları YENİDEN HESAPLAMA; verilen değerleri aynen kullan. Ondalık ayırıcı virgül (4,57). Yüzde farkı "%10 üstünde / altında" biçiminde yaz.
- Lig ortalamasına göre farkı hem değer hem yüzde olarak yaz (örn. "4,57, lig ortalamasının (4,16) yaklaşık %10 üstünde").
  Lig ortalaması yoksa karşılaştırma yapma, "lig ortalaması henüz yok" de.
- Küçük örneklemi her zaman belirt: bir metrik 10'dan az maça veya 5'ten az olaya (kırmızı, penaltı, VAR) dayanıyorsa
  "örneklem küçük, yorum için erken" de ve olay sayısını yaz (örn. "maç başına 0,14 × 7 maç ≈ 1 olay").
- Takım bazlı kart veya penaltı dağılımından kasıt, taraflılık veya eğilim sonucu ÇIKARMA. Yalnızca "gözlem" olarak ver ve örneklem uyarısı ekle.
- "Büyük 4" karşılaştırmasını yalnız veride büyük 4 grubu varsa yap (Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor).
- Veri tutarsızlığı varsa (takım kırılımı toplamı ile sezon tablosu toplamının uyuşmaması; kırılım yalnız orta hakemlik maçlarını ve en
  yeni maç parçalarını kapsar) dataNotes'ta kısaca açıkla. Yoksa dataNotes'a tek madde: "Belirgin tutarsızlık tespit edilmedi."
- Ton: bilgilendirici, kısa, spekülasyonsuz. Emoji yok. Bahis dili yasak ("bahis", "iddaa", "kupon", "banko", "oran", "üst/alt",
  "KG var/yok", "1X2"); tahmin veya tavsiye verme. Kaynağa atıf yapma ("verilen veriye göre" yazma) — olguyu doğrudan yaz.
- Her madde tek-iki cümle. Bir bölüm için veri yoksa o diziye tek madde yaz: "Bu bölüm için yeterli veri yok."
- Çıktı yalnız JSON.

ALANLAR
- summary: 2-3 cümle: genel profil, en belirgin sapma, örneklem uyarısı.
- currentSeason: sarı, kırmızı, penaltı ve VAR için AYRI birer madde (4 madde): değer, lig ortalaması, yüzde fark, yaklaşık olay sayısı, anlamlılık yorumu.
- trend: 3-4 madde: faul trendi, faul başına sarı ve penaltı değişimi, üç sezonluk ağırlıklı ortalamanın lig ortalamasıyla karşılaştırması
  (lig ortalaması güncel sezona aittir; bunu belirt).
- competitions: ana lig dışı (alt lig, kupa, Avrupa) maçların ana ligle karşılaştırması + örneklem notu. Yoksa "Ana lig dışında maç yok."
- teams: büyük 4 ile diğerleri, lehine penaltı dağılımı, yüksek kart oranlı takımlar, sık eşleşmeler; her maddede örneklem uyarısı.
- recent: ana lig gol ortalaması, ev/beraberlik/deplasman dağılımı, dikkat çeken eşleşmeler.
- dataNotes: tutarsızlıklar.
- conclusion: 2-3 cümlelik profil tanımı ve verinin kaç maçta netleşeceği.`;

export type RefereeReportJson = {
  summary: string;
  currentSeason: string[];
  trend: string[];
  competitions: string[];
  teams: string[];
  recent: string[];
  dataNotes: string[];
  conclusion: string;
};

const LIST_KEYS = ['currentSeason', 'trend', 'competitions', 'teams', 'recent', 'dataNotes'] as const;
const STR = { type: 'string' };
const LIST = { type: 'array', items: STR };

export const REFEREE_REPORT_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'referee_report',
    strict: true,
    schema: {
      type: 'object',
      properties: { summary: STR, currentSeason: LIST, trend: LIST, competitions: LIST, teams: LIST, recent: LIST, dataNotes: LIST, conclusion: STR },
      required: ['summary', 'currentSeason', 'trend', 'competitions', 'teams', 'recent', 'dataNotes', 'conclusion'],
      additionalProperties: false,
    },
  },
};

export function validateRefereeReport(data: unknown): RefereeReportJson {
  if (!data || typeof data !== 'object') throw new Error('Hakem raporu obje değil');
  const d = data as Record<string, unknown>;
  const str = (k: string) => {
    const v = d[k];
    if (typeof v !== 'string' || !v.trim()) throw new Error(`${k} eksik`);
    if (findGamblingTerms(v).length) throw new Error(`${k} kumar dili içeriyor`);
    return v.trim();
  };
  const list = (k: string) => {
    const v = d[k];
    if (!Array.isArray(v)) throw new Error(`${k} dizi değil`);
    // Kumar dili geçen madde atılır (bütün raporu düşürmek yerine).
    return v
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0 && findGamblingTerms(x).length === 0)
      .map((x) => x.trim())
      .slice(0, 8);
  };
  const out = { summary: str('summary'), conclusion: str('conclusion') } as RefereeReportJson;
  for (const k of LIST_KEYS) out[k] = list(k);
  if (out.currentSeason.length === 0 && out.trend.length === 0) throw new Error('Hakem raporu boş');
  return out;
}

const n = (v: number | null | undefined, digits = 2) => (v == null ? 'yok' : v.toLocaleString('tr-TR', { maximumFractionDigits: digits }));
const pct = (v: number | null) => (v == null ? 'yok' : v === 0 ? 'aynı' : `%${n(Math.abs(v), 1)} ${v > 0 ? 'üstünde' : 'altında'}`);
const LABEL: Record<CurrentMetric['key'], string> = { yellow: 'Sarı kart', red: 'Kırmızı kart', penalties: 'Penaltı', var: 'VAR müdahalesi' };

/** Modele giden kullanıcı mesajı: yalnız hesaplanmış metrikler (düz metin, Türkçe sayı biçimi). */
export function buildRefereeReportUserMessage(m: RefereeReportMetrics): string {
  const L: string[] = [];
  L.push(`HAKEM: ${m.name}${m.country ? ` (${m.country})` : ''}`);
  L.push(`Kapsanan toplam maç (bütün lig ve sezonlar): ${m.totalMatches}`);
  L.push(`Ana lig: ${m.mainLeague?.name || 'bilinmiyor'}`);

  L.push('', '## GÜNCEL SEZON (ana lig)');
  if (!m.currentSeason) L.push('Veri yok.');
  else {
    const c = m.currentSeason;
    L.push(`Sezon ${c.seasonName}, ${c.matches} maç${c.matches < 10 ? ' (10 maçtan az: örneklem küçük)' : ''}. Lig ortalaması: ${c.leagueAvgAvailable ? 'aynı lig-sezonun hakem ortalaması' : 'YOK'}.`);
    for (const x of c.metrics) {
      L.push(
        `- ${LABEL[x.key]}/maç: ${n(x.value)} | lig ort.: ${n(x.leagueAvg)} | fark: ${pct(x.diffPct)} | yaklaşık olay: ${x.events ?? 'yok'}${x.smallSample ? ' | ÖRNEKLEM KÜÇÜK' : ''}`,
      );
    }
  }

  L.push('', '## SEZONLAR ARASI (yalnız ana lig, en yeni önce)');
  if (!m.trend.length) L.push('Veri yok.');
  for (const t of m.trend) {
    L.push(
      `- ${t.seasonName}: ${t.matches} maç | sarı ${n(t.yellow)} | kırmızı ${n(t.red)} | penaltı ${n(t.penalties)} | faul ${n(t.fouls)} | VAR ${n(t.var)} | faul başına sarı ${n(t.yellowPerFoul, 3)} | faul başına penaltı ${n(t.penaltiesPerFoul, 4)}`,
    );
  }
  if (m.weighted) {
    const w = m.weighted;
    L.push(
      `Üç sezon maç ağırlıklı ortalama (${w.matches} maç): sarı ${n(w.rates.yellow)} (güncel lig ort.'na göre ${pct(w.vsLeagueAvgPct.yellow)}), kırmızı ${n(w.rates.red)} (${pct(w.vsLeagueAvgPct.red)}), penaltı ${n(w.rates.penalties)} (${pct(w.vsLeagueAvgPct.penalties)}), VAR ${n(w.rates.var)} (${pct(w.vsLeagueAvgPct.var)})`,
    );
  }

  L.push('', '## ANA LİG DIŞI MAÇLAR (maç başı)');
  if (!m.otherCompetitions.length) L.push('Ana lig dışında maç yok.');
  for (const o of m.otherCompetitions) {
    L.push(`- ${o.league} ${o.seasonName}: ${o.matches} maç | sarı ${n(o.yellow)} | kırmızı ${n(o.red)} | penaltı ${n(o.penalties)} | VAR ${n(o.var)}`);
  }

  L.push('', '## TAKIM KIRILIMI');
  const t = m.teams;
  if (!t) L.push('Veri yok.');
  else {
    L.push(`Sezon ${t.seasonName} (bütün ligler), ${t.matchCount} orta hakemlik maçı.`);
    L.push(`Kırılım toplamı: sarı ${t.totals.yellow}, kırmızı ${t.totals.red}, lehine penaltı ${t.totals.penaltiesFor}.`);
    L.push(
      `Sezon tablosundan aynı sezon toplamı (${t.seasonTableTotals.matches} maç, maç başı × maç): sarı ${t.seasonTableTotals.yellow ?? 'yok'}, kırmızı ${t.seasonTableTotals.red ?? 'yok'}, penaltı ${t.seasonTableTotals.penalties ?? 'yok'}.`,
    );
    if (t.big4) {
      L.push(
        `Büyük 4: ${t.big4.teams} takım, ${t.big4.teamMatches} takım-maç, ${t.big4.yellow} sarı (takım-maç başı ${n(t.big4.yellowPerTeamMatch)}), lehine penaltı ${t.big4.penaltiesFor}.`,
      );
    } else L.push('Büyük 4 grubu: bu sezonda büyük 4 takım maçı yok.');
    L.push(
      `Diğer takımlar: ${t.others.teams} takım, ${t.others.teamMatches} takım-maç, ${t.others.yellow} sarı (takım-maç başı ${n(t.others.yellowPerTeamMatch)}), lehine penaltı ${t.others.penaltiesFor}.`,
    );
    L.push(`Lehine penaltı alanlar: ${t.penaltiesFor.length ? t.penaltiesFor.map((p) => `${p.name} ${p.penaltiesFor} (${p.matches} maç)`).join(', ') : 'yok'}.`);
    L.push(`En yüksek sarı oranı (en az 2 maç): ${t.highCardTeams.length ? t.highCardTeams.map((h) => `${h.name} ${n(h.yellowPerMatch)}/maç (${h.matches} maç, ${h.yellow} sarı, ${h.red} kırmızı)`).join('; ') : 'yok'}.`);
    L.push(`En sık yönetilen takımlar: ${t.mostFrequent.map((f) => `${f.name} ${f.matches}`).join(', ')}.`);
  }

  L.push('', '## SON MAÇLAR');
  const r = m.recent;
  for (const p of r.pairs) L.push(`- ${p.date ?? ''} ${p.home} ${p.score} ${p.away} (${p.league || 'lig bilinmiyor'})`);
  if (r.matches) {
    L.push(
      `${r.league} maçları: ${r.matches} maç, ${r.goals} gol (maç başı ${n(r.goalsPerMatch)}); ev galibiyeti ${r.homeWins}, beraberlik ${r.draws}, deplasman galibiyeti ${r.awayWins}.`,
    );
    L.push(`Birden çok görünen takımlar: ${r.teams.length ? r.teams.map((x) => `${x.name} ${x.count}`).join(', ') : 'yok'}.`);
  } else L.push('Son maçlarda ana lig maçı yok.');

  return L.join('\n');
}
