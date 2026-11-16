/**
 * Hakem AI raporu (hakem sayfası, grafikli "hakem karnesi"): sayılar `server/people/refereeReportMetrics.ts`'te
 * HESAPLANIR, grafikler de o metriklerden çizilir. Model yalnız KISA yorum verir: tek cümlelik başlık + 3-4 kısa içgörü.
 */
import type { CurrentMetric, RefereeReportMetrics } from '@/server/people/refereeReportMetrics';
import { findGamblingTerms } from '@/utils/gamblingTerms';

export const REFEREE_REPORT_VERSION = 'v2-referee-card-2026-11';

export const REFEREE_REPORT_SYSTEM_PROMPT = `Sen Scor3 için çalışan bir futbol istatistik analistisin. Sana bir hakemin ÖNCEDEN HESAPLANMIŞ
metrikleri veriliyor. Sayfada bu metriklerin grafikleri zaten var; senin işin grafiklerin üstünde duran ÇOK KISA yorumu yazmak.

KURALLAR
- Yalnız verilen metrikleri kullan; uydurma bilgi, maç detayı, kariyer geçmişi, tahmin yok. Sayıları yeniden hesaplama.
- Ondalık ayırıcı virgül (4,57). Lig ortalamasıyla farkı "%10 üstünde / altında" biçiminde yaz.
- Bir metrik 10'dan az maça ya da 5'ten az olaya (kırmızı, penaltı, VAR) dayanıyorsa bunu "az örnek" diye belirt.
- Takım bazlı kart / penaltı dağılımından kasıt, taraflılık veya eğilim sonucu ÇIKARMA; yalnız gözlem.
- Ton: bilgilendirici, sade, spekülasyonsuz. Emoji yok. Bahis dili yasak ("bahis", "iddaa", "kupon", "banko", "oran", "üst/alt",
  "KG var/yok", "1X2"); tavsiye yok. "Verilen veriye göre" gibi kaynak atfı yapma.
- Çıktı yalnız JSON.

ALANLAR
- headline: TEK cümle, en çok 22 kelime: hakemin genel profili ve en belirgin sapması.
- insights: 3 ya da 4 madde; her biri EN ÇOK 14 kelime, tek olgu. Öncelik: lig ortalamasından en büyük sapma, sezonlar arası
  değişim, son maçlardaki dikkat çeken durum, örneklem uyarısı. tone: "up" (lig ortalamasının / önceki sezonun üstünde),
  "down" (altında), "warn" (az örnek / veri notu), "neutral" (diğer).`;

export type RefereeInsightTone = 'up' | 'down' | 'warn' | 'neutral';
export type RefereeReportJson = { headline: string; insights: { tone: RefereeInsightTone; text: string }[] };

const TONES: readonly RefereeInsightTone[] = ['up', 'down', 'warn', 'neutral'];

export const REFEREE_REPORT_RESPONSE_FORMAT = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'referee_report',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        headline: { type: 'string' },
        insights: {
          type: 'array',
          items: {
            type: 'object',
            properties: { tone: { type: 'string', enum: [...TONES] }, text: { type: 'string' } },
            required: ['tone', 'text'],
            additionalProperties: false,
          },
        },
      },
      required: ['headline', 'insights'],
      additionalProperties: false,
    },
  },
};

export function validateRefereeReport(data: unknown): RefereeReportJson {
  if (!data || typeof data !== 'object') throw new Error('Hakem raporu obje değil');
  const d = data as Record<string, unknown>;
  const headline = typeof d.headline === 'string' ? d.headline.trim() : '';
  if (!headline) throw new Error('headline eksik');
  if (findGamblingTerms(headline).length) throw new Error('headline kumar dili içeriyor');
  if (!Array.isArray(d.insights)) throw new Error('insights dizi değil');
  // Kumar dili geçen madde atılır (bütün raporu düşürmek yerine).
  const insights = (d.insights as unknown[])
    .map((x) => x as { tone?: unknown; text?: unknown })
    .filter((x) => typeof x?.text === 'string' && x.text.trim() && findGamblingTerms(x.text).length === 0)
    .map((x) => ({ tone: TONES.includes(x.tone as RefereeInsightTone) ? (x.tone as RefereeInsightTone) : 'neutral', text: String(x.text).trim() }))
    .slice(0, 4);
  return { headline, insights };
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
