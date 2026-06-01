import OpenAI from 'openai';
import type { TeamBriefing } from '../types';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY tanımlı değil. .env.local dosyasını kontrol et.');
  client = new OpenAI({ apiKey });
  return client;
}

function buildPrompt(briefing: TeamBriefing, topic: string): string {
  const historyText = briefing.wcHistory.length > 0
    ? briefing.wcHistory.map((h) => `${h.year}: ${h.finish}`).join(', ')
    : 'Veri bulunamadı';

  const statsLines = [
    briefing.squadValue !== 'Bilinmiyor' ? `- Kadro değeri: ${briefing.squadValue}` : null,
    briefing.avgAge > 0 ? `- Ortalama yaş: ${briefing.avgAge.toFixed(1)}` : null,
    briefing.starPlayer
      ? `- Yıldız oyuncu: ${briefing.starPlayer.name} (${briefing.starPlayer.age} yaş, ${briefing.starPlayer.value})`
      : null,
    briefing.goalsPerGame !== null ? `- Maç başı gol: ${briefing.goalsPerGame.toFixed(2)}` : null,
    briefing.xgPerGame !== null ? `- Maç başı xG: ${briefing.xgPerGame.toFixed(2)}` : null,
    briefing.possessionPct !== null ? `- Top'a sahip olma: %${briefing.possessionPct.toFixed(0)}` : null,
  ].filter(Boolean).join('\n');

  const factsText = briefing.interestingFacts.join('\n- ');

  // Hangi istatistiklerin elimizde OLMADIĞINI açıkça listele — modelin uydurmasını engeller.
  const missingStats = [
    briefing.goalsPerGame === null ? 'maç başı gol' : null,
    briefing.xgPerGame === null ? 'maç başı xG' : null,
    briefing.possessionPct === null ? 'topa sahip olma oranı' : null,
    briefing.squadValue === 'Bilinmiyor' ? 'kadro değeri' : null,
    briefing.avgAge <= 0 ? 'ortalama yaş' : null,
  ].filter(Boolean) as string[];

  const missingStatsText = missingStats.length
    ? `Elimizde OLMAYAN (bu yüzden hakkında KESİN sayı söyleme) veriler: ${missingStats.join(', ')}.`
    : 'Yukarıdaki tüm istatistik alanları mevcut.';

  return `
Sen "Ofsayt Yok" adlı Türkçe futbol analiz YouTube kanalının sunucususun. Ton: enerjik, analitik, cesur, zaman zaman provokatif. İzleyicilere direkt konuş, jargon kullan ama herkese anlaşılır ol.

Aşağıdaki takım verilerini kullanarak "${briefing.team}" hakkında "${topic}" konusunu işleyen yaklaşık 10-12 dakikalık bir YouTube video scripti yaz.

=== TAKIM VERİSİ (yalnızca buradaki bilgiler doğrulanmıştır) ===
Takım: ${briefing.team}
Dünya Kupası katılım sayısı: ${briefing.totalAppearances}
Şampiyonluk: ${briefing.titles}
En iyi derece: ${briefing.bestFinish}
Son WC (2022): ${briefing.lastWcFinish}
WC geçmişi: ${historyText}

İstatistikler:
${statsLines || '(İstatistik verisi bulunamadı)'}

İlginç gerçekler:
- ${factsText}
===================

### DOĞRULUK KURALLARI (ÇOK ÖNEMLİ — İHLAL ETME)
- SADECE yukarıdaki "TAKIM VERİSİ" bölümündeki bilgileri olgu olarak kullan.
- Yukarıda OLMAYAN istatistik, yıl, skor, şampiyonluk sayısı veya derece UYDURMA. ${missingStatsText}
- Bir veri yoksa "elimizde net veri yok" de veya o konuyu yorum/senaryo dilinde geç; kesin sayı verme.
- 2026 Dünya Kupası'na katılımı KESİNLEŞMİŞ gibi anlatma. Eleme/katılım durumu burada belirtilmediyse "eğer turnuvaya gelirse", "katılması halinde" gibi ihtimal diliyle konuş.
- Oyuncu isimleri ve kulüpleri yalnızca yukarıda verilenlerle sınırlı tut; verilmeyen oyuncu için spekülatif iddia üretme.
- Tarihsel maç anlatırken yıl/sonuç uydurmak yerine "WC geçmişi" listesindeki verilere sadık kal.

Video script MUTLAKA şu bölümleri içersin ve her bölümü ## başlık ile işaretle:

## GİRİŞ HOOK (yaklaşık 30 saniye)
Güçlü bir açılış sorusu veya provokasyon. İzleyiciyi ilk andan yakala. Kısa ve sert.

## BÖLÜM 1: TARİHÇE VE GEÇMİŞ PERFORMANS (yaklaşık 2 dakika)
Tarihsel WC sicilini anlat. İlginç anlar, beklenmedik sonuçlar, kırılma noktaları.
[B-ROLL: Eski dünya kupası maç görüntüsü]

## BÖLÜM 2: GÜNCEL KADRO ANALİZİ (yaklaşık 3 dakika)
Mevcut kadroyu değerlendir. Yıldız oyuncular, güçlü/zayıf yanlar, teknik direktör.
[B-ROLL: Yıldız oyuncu sahne görüntüsü]

## BÖLÜM 3: 2026 DÜNYA KUPASI SENARYOSU (yaklaşık 3 dakika)
Bu takım 2026'da ne kadar ilerleyebilir? Gerçekçi değerlendirme, olası rakipler.
[B-ROLL: ofsaytyok.com bracket ekran kaydı]

## BÖLÜM 4: İLGİNÇ DETAYLAR VE DEDIKODULAR (yaklaşık 2 dakika)
Takımla ilgili daha az bilinen bir gerçek, sürpriz bir istatistik veya güncel bir dedikodu.
[B-ROLL: Grafik animasyonu / infografik]

## KAPANIŞ (yaklaşık 30 saniye)
Özet, izleyiciyle etkileşim (yorum sorusu), abone çağrısı.

Kurallar:
- Konuşma dili olsun, akademik değil
- Cümleler kısa olsun (teleprompter için)
- [PAUSE] işareti ile nefes yerleri ekle
- [B-ROLL: ...] satırları scripte dahil olsun (bunlar sahne notları)
- Türkçe yaz, Türkiye futbol kültürüne hitap et
`.trim();
}

export async function generateScript(briefing: TeamBriefing, topic: string): Promise<string> {
  console.log(`[Script] OpenAI ile script oluşturuluyor...`);

  const openai = getClient();
  const prompt = buildPrompt(briefing, topic);

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? 'gpt-4.1',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 4000,
    // Olgusal içerik için daha düşük sıcaklık → halüsinasyon riskini azaltır.
    temperature: 0.6,
  });

  const script = response.choices[0]?.message?.content ?? '';
  if (!script) throw new Error('OpenAI boş yanıt döndürdü.');

  return script;
}
