# Ofsayt Yok — AI Asistan: İnceleme, Analiz ve Plan

Tarih: 2026-10-02 · Kapsam: yalnız inceleme. Repoda dosya değişmedi; commit/push yok. Üretim veritabanında okuma yapılmadı; yalnız şema ve kod incelendi.
Sportmonks: **28 istek** atıldı (sınır 50); ham yanıtlar `scratchpad/sm/`. LLM'e test çağrısı yapılmadı.

---

## 1. Kısa özet

- **Fizibilite yüksek, en büyük risk "sayma kuralı".** Gerçek veri testinde Trabzonspor 4–0 Galatasaray (19 Eyl) maçında olaylarda (events) **7 sarı kart**, istatistikte (statistics) **5 sarı kart** var. Fark iki karttan geliyor: teknik direktör Okan Buruk'un sarısı ve oyuncu adı olmayan bir "sportmenlik dışı" kart. Asistan sayıyı LLM'e saydırmamalı. Sayıyı sunucu, tanımlı bir kuralla hesaplamalı ("oyuncu kartları; teknik ekip ayrıca").
- **Kullanıcının örneği tuzak içeriyor.** 5 Ekim'de Galatasaray maçı yok; sıradaki maç 9 Ekim (Kasımpaşa). Doğru cevap "o tarihte maç yok, en yakın maç şu". Uydurma testinin ilk maddesi bu olmalı.
- **Kapsam ölçüldü.** Plan 34 lig içeriyor. Ulusal liglerde yalnız **3 sezon** var (2024/25'ten beri). Şampiyonlar Ligi ve Avrupa Ligi'nde **2000/01'den beri 27 sezon** var. Ancak eski maçlarda istatistik yok, yalnız olaylar var: 2013 Real Madrid–GS maçında 17 olay, 0 istatistik geldi. Sportmonks "boş sonuç" ile "planınızda yok" için **aynı mesajı** döndürüyor. Kapsam dışı tespiti bu yüzden yerel bir kapsam tablosuyla yapılmalı.
- **Altyapının çoğu hazır.** Hazır parçalar:
  - `fetchSportmonksCached`: tek kapı, Redis + L1 önbellek, eskimiş veri yedeği ve kota izleme.
  - `getRequestAuth`: web oturumu + mobil Bearer JWT.
  - `hitFixedWindowRateLimit`.
  - Kredi defteri.
  - Kural Köşesi paneli: tembel yükleniyor, sekmeye çevrilebilir.

  7 Ekim allowlist enforce'u **yalnız istemci proxy'sini** etkiliyor. Sunucu tarafındaki asistan route'u etkilenmiyor.
- **Önce düzeltilmesi gerekenler (ön koşul):**
  - `spendCredits` yarış durumuna açık. Koşullu düşüm yok, `FOR UPDATE` yok.
  - Hata durumunda kredi iadesi yok.
  - Sportmonks upstream `fetch`'inde zaman aşımı yok.
  - Mevcut AI kodu `OPENAI_API_KEY` varsa her zaman OpenAI'yi seçiyor. Asistan için ayrı sağlayıcı/model ayarı gerekli.
- **Katman 2'de dikkat.** Trivia metinleri (`ertemFacts`, `rivalryContext`) LLM'in **kendi genel bilgisiyle** üretiliyor. Prompt açıkça "genel futbol bilginle de destekle" diyor. Bu metinler "asistan sayıyı kendi bilgisinden söylemez" ilkesini dolaylı yoldan deler; **olgu kaynağı sayılmamalı**. AI analizleri ise tahmin, olgu değil; "Ofsayt Yok AI tahmini" etiketiyle sunulmalı.
- **Maliyet düşük.**
  - LLM, soru başına yaklaşık $0,0004 (gpt-5-nano) ile $0,02 (Sonnet 5.5, önbelleksiz) arasında. Haiku 4.5 yaklaşık $0,004–0,008.
  - Günde 10.000 soruda aylık LLM maliyeti yaklaşık $120 (nano), $600 (gpt-5-mini) veya $1.100 (Haiku).
  - Sportmonks'ta ek maliyet yok; mevcut plan yetiyor.
  - Embedding maliyeti ihmal edilebilir (< $1/ay).
- **Vercel uyarısı.** Hobby planı **ticari kullanımı yasaklıyor**. Kredi satışı veya reklam başladığında Pro ($20/ay) zorunlu hale geliyor. Günde 10.000 soruda Hobby'nin Active CPU ve bellek sınırları da aşılıyor.

---

## 2. Mimari şeması (metin)

```
[Tarayıcı / ileride native]
   │  Launcher (idle'da yüklü) → Panel (tıklayınca) → AssistantTab (sekmeye geçince import())
   │  bağlam: router.asPath'ten (/matches/{id}-…, /teams/{id}) — sayfalara import eklenmez
   ▼
POST /api/assistant/ask   (Node runtime, SSE stream, maxDuration 30 sn)
   ├─ getRequestAuth (web oturumu | mobil Bearer)    ── yoksa 401 (veya anonim kotası)
   ├─ hitFixedWindowRateLimit (kullanıcı + IP) + günlük kota (Redis) + global $ bütçe sigortası
   ├─ cevap önbelleği (normalize soru + bağlam + veri sürümü) ── HIT → doğrudan dön
   │
   ├─ 1) NİYET + VARLIK ÇIKARIMI  (LLM, yapılandırılmış çıktı; araç yok)
   │      → {intent, teams[], players[], dateExpr, competition, statType}
   ├─ 2) DETERMİNİSTİK ÇÖZÜMLEME (LLM yok)
   │      takım: alias sözlüğü → teams/search (24 sa önbellek) → aday skorlama
   │      tarih: Europe/Istanbul göreli tarih çözücü → UTC aralığı
   │      turnuva: 34 lig sözlüğü + TR takma adlar; kapsam tablosu (sezon derinliği)
   │      → kapsam dışıysa: "bilmiyorum" + AssistantQuestion kaydı
   ├─ 3) KATMAN ARACI (yalnız okuma; çıktı = kırpılmış "facts" + source{label, href})
   │      K1 Sportmonks  : findFixture, fixtureFacts, standings, topScorers, teamForm,
   │                       nextMatch, h2h, playerSeasonStats   (fetchSportmonksCached)
   │      K2 Kendi içerik: matchAnalysis(matchId), kuralKosesi(FTS), aiAccuracy
   │      K3 Wikipedia   : wikiSearch(tr→en) + wikiExtract (Redis 7 gün)
   │      Kural: üst katman cevap verirse alta inilmez; niyet tipi bir katmanı
   │      hiç kapsamıyorsa (ör. kural sorusu) o katman atlanır.
   ├─ 4) CEVAP ÜRETİMİ (LLM, yalnız dönen facts ile; JSON: {answer, claims[{value, factPath}]})
   ├─ 5) DOĞRULAYICI: cevaptaki her sayı/tarih/isim facts içinde birebir var mı?
   │      hayır → 1 kez yeniden üret → yine hayır → şablon cevap ya da "bilmiyorum"
   ├─ 6) Kredi düşümü (yalnız başarılı cevapta; atomik) + kullanım logu (token, ms, katman)
   └─ SSE: meta(kaynak, link) → delta(metin) → final(cevap kartı JSON)
```

Mobil uyumluluk: route `getRequestAuth` kullandığı için native Bearer JWT ile aynı uç noktayı çağırabilir. `final` olayı tam cevap kartını JSON olarak taşır; native, akışı (delta olaylarını) yok sayabilir.

---

## 3. Katman katman bulgular

### A) Mevcut altyapı

**LLM kullanımı**
- Sağlayıcı seçimi `src/services/aiAnalysisService.ts:42-48` içindeki `getProvider()` ile yapılıyor. `OPENAI_API_KEY` tanımlıysa her zaman OpenAI kullanılıyor; Anthropic'e yedek geçiş yok.
- Varsayılan modeller: `gpt-4.1` ve `claude-sonnet-4-5-20250929` (`ANTHROPIC_MODEL` / `OPENAI_MODEL` env'iyle değişir).
- Yerel `.env.local` dosyasında yalnız OpenAI anahtarı var. Prod'un hangi sağlayıcıyı kullandığı koddan görülemiyor.
- Kullanılmayan özellikler: streaming, tool use, structured output, yeniden deneme.
- JSON, yanıttaki ilk `{` ile son `}` arası kesilerek alınıyor (`extractJson`).
- Ayarlar:
  - Analiz: `MAX_TOKENS 5000`, zaman aşımı 35 sn.
  - Trivia (`aiTriviaService.ts`): 2000 token, 20 sn, giriş zorunlu, saatte 20 istek, **kredisiz**.
- Kullanım kaydı yalnız `tokensUsed` toplamı ve `modelVersion` alanlarında. Girdi/çıktı tokenı ayrı tutulmuyor, maliyet hesabı yok.
- Asistan için öneri: `src/server/assistant/llm.ts` içinde **ayrı bir adaptör** yazılmalı. Ayarlar `ASSISTANT_PROVIDER` ve `ASSISTANT_MODEL` env'leriyle verilmeli; tool calling ve streaming desteklemeli. Girdi, önbellekli girdi ve çıktı tokenları ayrı loglanmalı.

**Kredi sistemi**
- Bakiye: `User.credits` (varsayılan 5).
- Defter: `CreditTransaction`. `type` sütunu enum değil, düz string; değerler SIGNUP_BONUS, PURCHASE, ANALYSIS_SPEND, ANALYSIS_FREE, ADMIN_GRANT, REFUND.
- Analiz 5 kredi. Akış: `POST /api/matches/[id]/analysis` → `requireAuth` → saatte 30 istek → önbellekte varsa ücretsiz → `spendCredits` → üretim.
- **Açıklar:**
  1. `spendCredits` (`src/lib/credits.ts:32-56`) önce okuyor, sonra yazıyor. Kilit ya da `credits >= n` koşulu yok; eşzamanlı iki istek bakiyeyi ikisi birden geçebilir.
  2. Üretim hata verirse (504 ya da şema hatası) **kredi iade edilmiyor**. Kodda hiçbir yer REFUND yazmıyor.
  3. Aynı maç için eşzamanlı iki üretim olursa ikisinden de kredi düşer; ikinci `create` unique hatasıyla düşer.
- "Premium" bugün şöyle tanımlı: `isPremiumUser` = ADMIN ya da `credits >= 100` (`src/lib/premium.ts`). Ayrı bir abonelik yok. Paketler 5, 50 ve 100 kredi; fiyat ve ödeme kodu yok. Stripe env'leri tanımlı ama kodda okunmuyor.
- Asistan için öneri: aynı defter, yeni tipler `ASSISTANT_SPEND` ve `ASSISTANT_REFUND`. Düşüm **cevap başarılı olduktan sonra** yapılmalı, ya da önce düşüp hata halinde aynı istekte iade edilmeli. Atomik koşullu düşüm:

  ```sql
  UPDATE "User" SET credits = credits - n WHERE id = $1 AND credits >= n
  ```

  Etkilenen satır sayısı 0 ise yanıt 402. Bu düzeltme mevcut analiz akışına da uygulanmalı.

**Oturum, rate limit ve kötüye kullanım**
- Oturum: NextAuth v4, JWT. Oturumda `id`, `role` ve `credits` var; DB'den 60 sn'de bir tazeleniyor. API route'larında `getRequestAuth` web oturumunu ve mobil Bearer token'ı birlikte çözüyor (`src/lib/mobileAuth.ts:65`).
- Rate limit: `src/lib/rateLimit.ts` → `@upstash/ratelimit` fixed window. Redis hata verirse **fail-open** (istek geçer). Anahtar kullanıcıya ya da IP'ye göre (`x-forwarded-for` ilk değer).
- CAPTCHA: Turnstile yalnız kayıtta var. Middleware'de rate limit yok.
- Asistan için öneri:
  - Girişi zorunlu tut; Turnstile kayıtta zaten var.
  - Kullanıcı başına iki limit: günlük kota (Redis sayaç, TR gece yarısı sıfırlanır) ve dakikada 6 istek. IP başına da dakikada 20 istek.
  - **Global günlük $ bütçe sigortası**: Redis'te tahmini maliyet toplanır, eşik aşılınca asistan "geçici kapalı" der.
  - Rate limit fail-open olduğu için Redis kesintisinde kota da çalışmaz. Kredi düşümü DB'de olduğu için ücretli sorular yine korunur; ücretsiz kota için bu risk kabul edilebilir.
  - Soru en fazla 300 karakter.
  - Araçlar yalnız okuma yapar. Prompt injection en fazla yanlış cevap üretebilir; onu da doğrulayıcı yakalar.

### B) Katman 1 — Sportmonks

**Gerçek istek bulguları (2026-10-02, 28 istek):**

| Test | Sonuç |
|---|---|
| `teams/search/Galatasaray`, `Fenerbahce` (ASCII), `Besiktas` | Hepsi tek doğru sonuç (34, 88, 554). **Aksansız arama çalışıyor.** |
| `teams/search/Cimbom` | Boş → **takma ad sözlüğü şart** |
| `teams/search/Trabzon` | 4 aday (Trabzonspor, 1461 Trabzon, …) → aday skorlama gerekli |
| `teams/search/Real Madrid` | Real Madrid + Real Madrid II. `Kashima` → boş (plan dışı lig) |
| `fixtures/between/2026-08-01/2026-09-19/34` | 7 maç, tek istek (Fixture havuzu) |
| `fixtures/19746609` (TS 4–0 GS) tam include | 40,8 KB ham / 5,3 KB gz; alan seçimli 19,4 KB / 2,7 KB gz |
| Aynı maçta kart | events: 7 sarı + 1 sarı-kırmızı + 1 kırmızı + 1 VAR_CARD; statistics (type 84): TS 4, GS 1 |
| `standings/seasons/28203` | 18 takım + 22 detay tipi (iç/dış saha ayrı) |
| `topscorers/seasons/28203` (type 208) | Orban 7, Salah 7, Osimhen 6 … |
| `fixtures/head-to-head/34/88` | **Yalnız 5 maç (2024-09'dan beri)**; ulusal lig geçmişi 3 sezon |
| `leagues` (plan) | 34 lig. Ulusal ligler 3 sezon (2024/25 ya da 2024'ten). ŞL/AL 27 sezon (2000/01), Süper Kupa 23, Konferans Ligi 6 |
| GS 2023 Ekim maçları | Yalnız ŞL maçları geldi; 2023 Süper Lig maçları **yok** |
| `fixtures/1058753` (2013 Real–GS) | Skor ve 17 olay var, **istatistik 0** |
| `players/search/Osimhen` + `players/{id}?include=statistics.details.type&filters=playerStatisticSeasons` | 6 gol (5 + 1 penaltı), 2 asist, 4 maç. **İsimde sonda NBSP var** (`"Victor Osimhen "`) |
| `fixtures/date/2026-09-27` + lig filtresi | Boş. Mesaj, plan dışı sorgularla **aynı**: "No result(s)… or you don't have access" |
| `teams/34?include=upcoming` | Sıradaki: 9 Eki Kasımpaşa, 13 Eki Barcelona, … **5 Ekim'de maç yok** |

Kota: Fixture havuzunda `remaining` 2347 / 2500 (saatlik) görüldü. Abonelik bugün 200 dönüyor. `docs/API_FOOTBALL_MIGRATION.md` deneme süresinin 1 Ekim'de bittiğini yazıyor; **ücretli plana geçişin tamamlandığını panelden teyit et.**

**Soru tipi → endpoint → istek sayısı** (soğuk önbellek; sıcak önbellekte çoğu 0):

| Soru tipi | Endpoint + include | İstek |
|---|---|---|
| Belirli maçın skoru, golcüleri, kartları, kornerleri, istatistikleri | (takım çözümleme: alias → 0, değilse `teams/search` 1) + `fixtures/between/{from}/{to}/{teamId}` + `fixtures/{id}?include=participants;scores;state;events;statistics` (alan seçimli) | 2–3 |
| "Son maç" | `teams/{id}?include=latest.participants;latest.scores;latest.league;latest.state` (mevcut `teamPage.ts`) + `fixtures/{id}` | 2 |
| Takım formu (son 5) | `teams/{id}` latest (yukarıdaki) | 1 |
| Sıradaki maç | `teams/{id}?include=upcoming…` (mevcut `TEAM_UPCOMING_INCLUDE`) | 1 |
| Puan durumu | `leagues/{id}?include=seasons` (24 sa önbellek) + `standings/seasons/{sid}?include=participant;details.type` | 1–2 |
| Gol / asist krallığı | `topscorers/seasons/{sid}` + `filters=seasonTopscorerTypes:208` (209 asist) | 1–2 |
| H2H | `fixtures/head-to-head/{a}/{b}` (mevcut `getTeamsHead2Head`) | 1 |
| Oyuncu sezon istatistiği | `players/search/{ad}` + `players/{id}?include=statistics.details.type&filters=playerStatisticSeasons:{sid}` | 2 |
| Günün maçları ("dün Süper Lig") | `fixtures/date/{D-1}` + `fixtures/date/{D}` (UTC) → TR gününe süz (mevcut `server/homeDay.ts`) | 0–2 |

Ortalama soğuk önbellekte yaklaşık 1,8 istek. Popüler maçlarda önbellek isabeti yüksek olur; `cachePolicy` bitmiş maçı 15 dk ile 24 sa arasında taze sayıyor.

**LLM'e gidecek veri kırpılmalı.** Alan seçimli maç detayı ham 19 KB, yani yaklaşık 6.000 token. Araç yalnız sorulan stat ailesini döndürmeli, örneğin kart sorusunda yalnız kart olayları ve 83/84 istatistikleri. Hedef araç sonucu başına ≤ 1.200 token.

**Sayma kuralları sunucuda sabitlenmeli** (LLM'e bırakılmamalı):
- Sarı kart: oyuncu kartı için `statistics` type 84 esas alınır. Teknik ekip kartı (`player_id` null, ya da `coach_id` dolu) ayrıca belirtilir. "İkinci sarıdan kırmızı" (21) ve VAR ile düzeltilen kart (1697, `rescinded`) ayrı gösterilir.
- Gol: `GOAL`(14) + `PENALTY`(16) + `OWN_GOAL`(15). Oyuncu sezon golü penaltıyı içerir (Osimhen 6 = 5 + 1 penaltı); cevap bunu söylemeli.
- `addition` alanı ("7th Yellowcard") maç içi kümülatif sayaçtır, toplam sayı olarak kullanılmamalı.

**Varlık çözümleme**
- **Takım:**
  - Kaynak 1, `src/config/teamAliases.ts` (yeni): Süper Lig, 1. Lig ve büyük Avrupa kulüpleri için takma adlar. Örnekler: GS / Cimbom / Aslan / Sarı-Kırmızılılar → 34; FB / Fener / Kanarya → 88; BJK / Kartal / Kara Kartal → 554; TS / Bordo-Mavi / Karadeniz Fırtınası → 688; "Barça", "Real", "ManU", "Juve", "Bayern" vb.
  - Kaynak 2: `TEAM_SHORT_NAMES` (34 → GS …). Yalnız Süper Lig'deki 18 takımı kapsıyor.
  - Kaynak 3: `normalizeSearchText` ile (tr-locale küçük harf, ı→i, NFD) `teams/search`.
  - Aday skorlama: takım plan liginde mi, isimde "II/U19/Women" var mı, tam eşleşme mi.
  - Belirsiz kalırsa kullanıcıya iki seçenek gösterilir; tahmin yapılmaz.
- **Tarih:** deterministik çözücü (`src/server/assistant/dateResolver.ts`), referans Europe/Istanbul "şimdi".
  - Göreli ifadeler: "bugün", "dün", "evvelsi gün", "yarın", "bu hafta", "geçen hafta" (önceki Pazartesi–Pazar), "geçen hafta sonu", "geçen ay", "bu sezon", "geçen sezon".
  - Mutlak tarih: "5 Ekim". Yıl çıkarımı fiil kipine bağlı: geçmiş zaman → en yakın geçmiş tarih; gelecek → en yakın gelecek. Tek yıl bulunamazsa sorulur.
  - TR günü UTC aralığına çevrilir. `timezone=Europe/Istanbul` parametresi **kullanılmaz** (bilinen tuzak). Aralık ≤ 100 gün olmalı.
- **Turnuva:**
  - Kaynak: `SPORTMONKS_LEAGUE_NAME_KEYS` ve `public/locales/tr/leagues.json` (short/full).
  - Ek takma adlar: "ŞL", "Avrupa Ligi", "Konferans", "Kupa"/"ZTK" → 606, "1. Lig" → 603, "Premier Lig" → 8.
  - Turnuva belirtilmemişse takımın tüm maçları aranır, cevapta turnuva yazılır.
- LLM yalnız ham ifadeleri çıkarır ("dün", "Cimbom"). Çözümlemeyi her zaman sunucu yapar.

**Kapsam tespiti** (`src/config/assistantCoverage.ts`, `leagues?include=seasons` yanıtından üretilir):
- Lig 34 lig içinde değilse "plan dışı". Takım `teams/search` ile bulunamıyor ya da hiçbir plan liginde değilse de plan dışı.
- Tarih ligin ilk sezonundan önceyse "kapsam dışı":
  - ulusal ligler: 2024/25'ten önce;
  - ŞL/AL: 2000/01'den önce;
  - Konferans Ligi: 2021/22'den önce.
- İstatistik sorusu 2014'ten eski bir maç içinse "istatistik yok". Eşik tahmini, değerlendirme setinde netleştirilmeli.
- Sportmonks "No result(s)" dönerse ve kapsam tablosu "kapsam içi" diyorsa cevap "bu tarihte maç bulunamadı" olur. Aksi halde "kapsam dışı" olur ve soru kaydedilir.
- Sportmonks'un tarihî veri eki (€29, tek sefer) ulusal liglerde 3 sezondan eskisini açar. Karar sende.

**Allowlist ve rate limit**
- Allowlist yalnız `/api/sportmonks/[...path]` proxy'sinde uygulanıyor (`[...path].ts:48-59`). `fetchSportmonksCached` / `serverCachedFetch` kontrol yapmıyor. **Sunucu tarafındaki asistan route'u için allowlist girişi gerekmez; 7 Ekim enforce'u asistanı etkilemez.**
- Koşul: hazır soru önerileri de dahil, istemci Sportmonks'u **hiç doğrudan çağırmamalı**. Her şey `/api/assistant/*` üzerinden gitmeli.
- Kota (havuz başına saatte 2.500 istek), günde 10.000 soru senaryosunda bile sorun çıkarmaz. Tahmin:
  - akşam maç saatlerinde trafiğin %40'ı 3 saate toplanırsa saatte yaklaşık 1.300 soru;
  - × 1,8 istek × %20 önbellek ıskası ≈ saatte yaklaşık 480 Fixture isteği.

  Bu yük sitenin mevcut tüketiminin üzerine eklenir. `quotaMonitor` uyarı eşikleri zaten var.

**Önbelleğin yeniden kullanımı**
- Araçlar `sportmonksClientRequest` / mevcut servis fonksiyonları (`getTeamsHead2Head`, `getCompetitionTableFull`, `getTopScorers`, `teamPage.ts`) üzerinden çağrılmalı. TTL'ler `cachePolicy`'den otomatik gelir.
- Handler `trackSportmonksFetches` içine alınmalı. Veri eski (`stale`) ise cevap kartına "veri X itibarıyla" notu düşülür.
- **Eksik:** upstream `fetch`'te zaman aşımı yok (`cachedFetch.ts:206`). Asistan route'u her araç çağrısını yaklaşık 4 sn'lik bir `Promise.race` ile sarmalı.

### C) Katman 2 — Kendi içeriğimiz

| İçerik | Nerede | Dil | Link | Asistan için durum |
|---|---|---|---|---|
| AI maç analizi | `MatchAnalysis` (anahtar `matchId` + `matchStatus`); metin `fullReport` JSON | TR | `/matches/{id}-{ev}-{dep}` (`buildMatchHref`); analiz sekmesine derin link **yok** | Kullanılabilir, ama **"tahmin"** etiketiyle. Arama değil, fixture id ile birebir sorgu |
| Tahmin isabeti | `PredictionRecord` | — | `/ai-istatistikleri` | Kullanılabilir ("AI ne kadar tutuyor") |
| Trivia | `MatchTrivia` (`ertemFacts`, `contextual`, `rivalryContext`) | TR | maç sayfası | **Olgu kaynağı olamaz.** LLM genel bilgisiyle üretiyor (`triviaPrompt.ts`: "genel futbol bilginle de destekle"). Sayı içeren cevaplarda kullanılmamalı |
| Kural Köşesi | `src/content/kural-kosesi.json`, **8 madde**, TR + EN | TR/EN | Kendi sayfası yok; panel `openKuralKosesi()` ile açılır. Önerilen derin link: `?kural={id}` ya da olay detayı | En güvenli Katman 2 kaynağı (elle yazılmış) |
| Gündem | `Post` (kullanıcı + bot), `GundemBotDraft` | TR | `/gundem/{postId}` | Kullanıcı içeriği: **kaynak yapılmamalı** (doğrulanmamış, KVKK). Bot gönderileri şablondan üretiliyor ama zaten Katman 1 verisinin kopyası |
| Haberler | Yalnız RSS + Redis; tablo yok | TR/EN | `/news/{id}` (kısa ömürlü) | Kapsam dışı bırakılmalı (üçüncü taraf metin; link kalıcı değil) |

**Arama yöntemi önerisi**
- Gerçek "arama" ihtiyacı bugün çok küçük: Kural Köşesi 8 madde, analizler maç id'siyle bulunuyor.
- **Faz 2 için yeterli olan:** yapılandırılmış sorgu + **Postgres full-text search**. pgvector **gerekmiyor**; korpus büyüyünce hibrite geçilir.
- Yeni tablo `AssistantDocument`: `id`, `sourceType` (KURAL | ANALYSIS | …), `sourceId`, `locale`, `title`, `body`, `url`, `updatedAt` ve iki tsvector:
  - `tsv_stem = to_tsvector('turkish', title || body)`: Postgres'te Snowball `turkish` yapılandırması hazır geliyor.
  - `tsv_plain = to_tsvector('simple', imm_unaccent(lower(...)))`: aksansız yazımı yakalar. `unaccent()` IMMUTABLE değil, IMMUTABLE sarmalayıcı gerekir.
  - Ayrıca GIN indeksi ve isimler için `pg_trgm`.
  - Sorguda iki tsvector'ün eşleşmesi OR ile birleştirilir. Neden iki ayrı vektör: `unaccent` Türkçe kökleyiciden önce uygulanırsa (ş→s, ı→i) kökleme bozulur.
- Supabase'de `unaccent` ve `pg_trgm` "trusted" uzantılar. Migration'larda bugün hiçbir uzantı yok; yeni migration gerekir. RLS deny-all Prisma'yı etkilemez.
- **Güncelleme akışı:**
  - Kural Köşesi JSON'u → `scripts/assistant/sync-docs.ts` (deploy sonrası, ya da günlük cron).
  - Analiz oluşturulunca `analysis.ts` içinden upsert.
  - Mevcut günlük cron'a (`evaluate-predictions`) uzlaştırma adımı eklenebilir.
- **pgvector'e geçiş ölçütü:** değerlendirme setinde parafraz kaçırması %10'u geçerse `text-embedding-3-small` (1536 boyut) + HNSW ile hibrit (FTS + vektör, RRF birleştirme).
  - Maliyet: 2.000 doküman × 400 token = 0,8 M token → **$0,016** tek sefer. Günde 10.000 soruda sorgu embedding'i ≈ 12 M token/ay → **$0,24/ay**.
  - Anthropic'in embedding modeli yok; OpenAI ya da Voyage kullanılır.
  - Supabase'de pgvector `create extension vector` ile açılıyor. Free planda bulunup bulunmadığı resmi sayfadan teyit **edilemedi**.
- **Link:** analiz için maç sayfası. Analiz sekmesine derin link için `?tab=analysis` desteği eklenmeli (bugün sekme yalnız yerel state). Kural için paneli ilgili kurala açan bir link.

### D) Katman 3 — Wikipedia

- **Hangi API:**
  - Arama: Core REST `https://{tr|en}.wikipedia.org/w/rest.php/v1/search/page?q=…&limit=3`.
  - Metin: Action API `action=query&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=…`. Uzun maddelerde bölüm araması için `prop=extracts&exsectionformat=plain` ya da `action=parse&section=N`.
  - `rest_v1` (RESTBase) kullanımdan kaldırılma sürecinde; bazı uçları sonlandırılıyor. **Yeni kodda kullanılmamalı.**
- **User-Agent zorunlu:** `OfsaytYokBot/1.0 (https://www.ofsaytyok.app/iletisim; <iletişim e-postası>)`. Tarayıcıyı taklit eden ya da curl / python-requests gibi genel UA kullanan istemciler 403 alabilir. Çağrılar yalnız sunucudan yapılır.
- **Rate limit** (2026'da yeni ve "deneysel"): tanımsız istemci dakikada 10 istek; açıklayıcı UA ile dakikada 200 istek. Robot politikası: kimliksiz REST'te 3 eşzamanlı, saniyede 5 istek. Soru başına 2 istek (arama + metin), önbellekli. Günde 10.000 soru × %10 Katman 3 ≈ günde 1.000 çağrı; rahat sığar.
- **CC BY-SA 4.0 yükümlülükleri:**
  - maddeye köprü;
  - lisans adı ve lisans linki;
  - metnin özetlendiğinin ya da değiştirildiğinin belirtilmesi;
  - uyarlanan metnin aynı lisansla paylaşılması.

  Cevap kartında şu satır yer almalı: "Kaynak: Wikipedia — *Galatasaray SK* (CC BY-SA 4.0) · özetlenmiştir", madde ve lisans linkleriyle.
- **TR / EN seçimi:** önce TR. Madde yoksa ya da giriş bölümünde sorulan olgu yoksa EN. Cevap Türkçe yazılır, kaynakta "(İngilizce Wikipedia)" belirtilir.
- **Önbellek:** madde özeti 7 gün, arama 24 sa, "bulunamadı" 24 sa (Redis; `withRedis`). Wikipedia'daki sayılar da yanlış olabilir; kart "Wikipedia'ya göre" demeli.
- Kaynak sayfa:
  - [Reusing Wikipedia content](https://en.wikipedia.org/wiki/Wikipedia:Reusing_Wikipedia_content)
  - [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy)
  - [Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)

### E) Model ve akış

**Akış (tool calling):**
1. **Çağrı 1, çıkarım.** Araç yok; yapılandırılmış JSON şeması: `{intent, teams[], players[], dateExpr, competition, statType, needsClarification}`. Bağlam olarak sayfa bilgisi verilir (maç id'si, takım adları).
2. **Sunucu.** Çözümleme ve kapsam kontrolü yapılır, ardından tek araç ya da gerekirse en fazla 2 araç çalışır.
3. **Çağrı 2, cevap.** Girdi yalnız `facts` JSON'u. Sistem kuralları:
   - "Facts dışında sayı, tarih ya da isim yazma."
   - "Toplama/çıkarma yapma, hazır alanları kullan."
   - "En fazla 2 cümle."

   Çıktı: `{answer, claims:[{text, factPath}], confidence}`.
4. **Doğrulayıcı** (bkz. bölüm 8 sonu). Hata olursa 1 kez yeniden üretim; o da olmazsa şablon cevap ya da "bilmiyorum".

Hazır öneri çiplerinde varlıklar zaten çözülü. Bu yüzden 1. çağrı atlanır; istenirse cevap **şablonla** üretilir ve hiç LLM çağrılmaz.

**Token tahmini** (Türkçe metin İngilizceden yaklaşık 1,3–1,6 kat fazla token tutuyor):

| Bileşen | Token |
|---|---|
| Sistem promptu + araç/şema tanımları + sağlayıcının tool overhead'i (Haiku 4.5: 496) | ~2.000 (önbelleklenebilir) |
| Çağrı 1: statik + soru + bağlam | ~2.150 girdi / ~100 çıktı |
| Çağrı 2: statik + geçmiş + facts (≤1.200) | ~3.450 girdi / ~200 çıktı |
| %30 soruda ek araç turu | ortalamaya yedirilmiş |
| **Ortalama soru** | **~6.000 girdi (≈4.500 önbelleklenebilir) / ~350 çıktı** (gpt-5 akıl yürütme modellerinde +~400 reasoning tokenı) |

**Soru başına maliyet** (Standard fiyatlar; kaynaklar tablonun altında):

| Model | Girdi / önbellek okuma / çıktı ($/MTok) | Önbelleksiz | Önbellekli |
|---|---|---|---|
| Claude Haiku 4.5 | 1,00 / 0,10 / 5,00 | $0,0078 | $0,0037 |
| Claude Sonnet 5.5 (yeni tokenizer ≈ +%30 token) | 2,00 / 0,20 / 10,00 | $0,020 | $0,0096 |
| gpt-5-mini (+400 reasoning) | 0,25 / 0,025 / 2,00 | $0,0030 | $0,0020 |
| gpt-5-nano (+400 reasoning) | 0,05 / 0,005 / 0,40 | $0,0006 | $0,0004 |
| gpt-4.1-mini (reasoning yok) | 0,40 / 0,10 / 1,60 | $0,0030 | $0,0016 |
| gpt-5.4-mini | 0,75 / 0,075 / 4,50 | $0,0062 | $0,0033 |

Kaynaklar (2026-10-02'de çekildi): [Anthropic fiyatları](https://platform.claude.com/docs/en/about-claude/pricing), [OpenAI fiyatları](https://developers.openai.com/api/docs/pricing). Anthropic'te önbellek yazımı 5 dakikalık önbellek için 1,25 kat, okuması 0,1 kat. OpenAI ≥1.024 tokenlık önekleri otomatik önbelleğe alıyor. Batch indirimi (%50) gerçek zamanlı akışta kullanılamaz.

**Model önerisi:** iki aday değerlendirme setiyle (bölüm 8) yarıştırılmalı.
- **Kalite önceliği:** Claude Haiku 4.5. Türkçesi güçlü, tool use olgun, gecikmesi düşük.
- **Maliyet önceliği:** gpt-5-mini (`reasoning_effort: minimal`).

Kazanan, **uydurma oranı 0** şartını sağlayanlar arasından en ucuz olandır. gpt-5-nano Türkçe ifade kalitesinde riskli; yalnız çağrı 1 (çıkarım) için aday olabilir. Sonnet 5.5 bu iş için gereksiz pahalı.

### F) Vercel ve performans

Kaynak: [Vercel functions limitations](https://vercel.com/docs/functions/limitations), [Vercel pricing](https://vercel.com/pricing), [fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines). Hepsi 2026-10-02'de çekildi.

| | Hobby | Pro |
|---|---|---|
| Fonksiyon süresi | 300 sn varsayılan ve azami | 300 sn varsayılan, 800 sn azami (beta 1.800 sn) |
| Streaming | Var. Süreye akış da dahil | Aynı |
| Active CPU | 4 sa/ay; aşımda 30 gün bekleme (ek ücretle aşım yok) | $20 kullanım kredisi dahil; aşım fra1'de $0,184/sa |
| Provisioned memory | 360 GB-sa/ay | Aşım fra1'de $0,0152/GB-sa |
| Invocations | 1 M | Aşım $0,60/M |
| Ticari kullanım | **Yasak**: ödeme alma, ürün/hizmet satışı ilanı, reklam (AdSense dahil) | Serbest |

- **Active CPU, LLM beklenirken sayılmaz.** Provisioned memory ise beklerken de sayılır.
- Asistan çağrısı başına tahmin: ~60–120 ms CPU (oturum, Prisma, JSON kırpma, akış) ve ~3–6 sn duvar saati süresi.

| Senaryo (ay) | Soru | Active CPU | Bellek (1 GB'a ayarlanmış route) | Hobby'ye sığar mı? | Pro ek maliyeti |
|---|---|---|---|---|---|
| 100/gün | 3.000 | ~0,08 sa | ~4 GB-sa | Evet (bugünkü kullanım 1 sa 48 dk / 4 sa) | ~$0 |
| 1.000/gün | 30.000 | ~0,8 sa | ~42 GB-sa | Sınırda: toplam CPU ~2,6 / 4 sa | ~$1 |
| 10.000/gün | 300.000 | ~8,3 sa | ~420 GB-sa | **Hayır** | ~$1,5 CPU + ~$6,4 bellek + $0,2 çağrı ≈ $8, $20 kredisinin içinde |

- Route'ta `export const config = { maxDuration: 30 }` kullanılmalı ve bellek 1 GB'a düşürülmeli. Varsayılan 2 GB, bellek maliyetini ikiye katlar.
- Akış: Pages Router API route'u Node runtime'da `res.write` ile SSE gönderebilir. Edge runtime gerekmez; Prisma ve Redis istemcileri Node'da hazır.
- **Lighthouse etkisi sıfır tutulabilir.** Kural Köşesi işinde ölçülen kritik bulgu şu: ilk yükteki modüllere yeni ortak bağımlılık eklemek ya da `next/dynamic` kullanmak yerel mobil skoru 89'dan 88'e düşürüyordu. Kurallar:
  - `AssistantTab` yalnız `Panel.tsx` içinde, sekmeye geçince **yerel `import()`** ile yüklenir. `next/dynamic` kullanılmaz.
  - `Launcher` zaten `window.load` sonrasında idle'da yükleniyor. Ona eklenecek sekme etiketi ya da i18n anahtarı LCP'yi etkilemez.
  - Maç ve takım sayfalarına **hiç import eklenmez.** Bağlam, tembel yüklenen sekme içinde `router.asPath`'ten çözülür (`/matches/{id}-…`, `/teams/{id}`).
  - İstemcide SDK yok; `fetch` + `ReadableStream` yeterli. Markdown render kütüphanesi eklenmez; cevap düz metin ve kart.
  - Ölçüm, bilinen yöntemle (ayrı worktree, 5 koşu medyanı) "temele göre düşüş yok" ölçütüyle yapılır.

### G) Ürün ve arayüz

**Tek başlatıcı, iki sekme.** Mevcut yapıda gerekenler:
- `Panel.tsx` (191 satır):
  - `activeTab` state'i ve başlıkta `role="tablist"` eklenir.
  - Mevcut gövde ve alt kısım `KuralTab.tsx` bileşenine taşınır; `AssistantTab.tsx` tembel yüklenir.
  - `PanelProps`'a `initialTab?` eklenir.
  - Asistan sekmesinde sayaç ve noktalar gizlenir.
  - Mobil focus trap genel çalıştığı için değişmez.
- `openEvent.ts`: düz `Event` yerine `CustomEvent<{tab?: 'rules'|'assistant', question?: string}>`. `Mount.tsx` erken açılmada (`pendingOpen`) payload'ı korumalı.
- `Launcher.tsx`: `aria-label` ve `title` genelleştirilir ("Kural Köşesi ve Asistan"). Düdük ikonu ve "Biliyor muydun?" baloncuğu kalır; asistan için ayrı bir kampanya baloncuğu sonra eklenebilir.
- i18n: `kuralKosesi` namespace'ine `tabs.rules` ve `tabs.assistant` anahtarları; yeni `assistant` namespace'i (tembel; `i18nNamespaces/assistant.ts`).
- Panel genişliği: masaüstü 380 px, mobil `min(88vw, 360px)`. Sohbet için yeterli; giriş kutusu altta sabit, mobilde klavye için `visualViewport` ayarı gerekir.

**Sayfaya göre hazır sorular.** Sunucu `/api/assistant/suggestions?path=…` ile döner; maç durumuna göre değişir. Çiplerde varlıklar çözülü olduğu için cevap ucuzdur.
- Maç sayfası, maç öncesi: "Son 5 maçta formları?", "Aralarındaki son maç?", "Hakemi kim?", "AI tahmini ne?"
- Maç sayfası, canlı / maç sonu: "Kaç sarı kart çıktı?", "Golleri kim attı?", "Korner sayısı?", "Topla oynama?"
- Takım sayfası: "Sıradaki maçı ne zaman?", "Ligde kaçıncı?", "Takımın gol kralı?", "Son 5 maç formu?"
- Ana sayfa: "Süper Lig'de lider kim?", "Gol krallığında kim önde?", "Bugün hangi maçlar var?"

**Cevap kartı:**
```
┌──────────────────────────────────────────────┐
│ Maçta 5 oyuncu sarı kart gördü: Trabzonspor 4,│
│ Galatasaray 1. Ayrıca teknik direktör Okan    │
│ Buruk 72'de ikinci sarıdan kırmızı gördü.     │
│ [TS 4 – 1 GS sarı] [1 kırmızı: Ugochukwu 87']  │
│ ───────────────────────────────────────────── │
│ ● Ofsayt Yok maç verisi · 19 Eyl 2026          │
│ Maç sayfasına git →                 👍  👎     │
└──────────────────────────────────────────────┘
```
- Kaynak etiketleri: "Ofsayt Yok maç verisi", "Ofsayt Yok AI tahmini", "Kural Köşesi", "Wikipedia (CC BY-SA 4.0)".
- Veri eskiyse "veri X itibarıyla" notu düşülür.
- "Bilmiyorum" kartı: "Bu soruya güvenilir bir kaynaktan cevap bulamadım. Sorunu kaydettik." Varsa en yakın alternatif önerilir ("9 Ekim Kasımpaşa maçını mı kastettin?").

**Cevapsız soruların kaydı.** Yeni model `AssistantQuestion` (tüm sorular için kullanım logu da olabilir; ayrı tutmak daha temiz):

| Alan | Not |
|---|---|
| `id`, `createdAt` | |
| `questionRedacted` | PII ayıklanmış metin, ≤300 karakter |
| `intent`, `entities` (JSON: çözümlenmiş id'ler) | |
| `outcome` | ANSWERED / NO_DATA / OUT_OF_PLAN / OUT_OF_RANGE / AMBIGUOUS / OUT_OF_SCOPE / VERIFY_FAILED |
| `layerTried`, `pagePath` (query string'siz), `locale` | |
| `feedback` (+1 / −1 / null) | |
| `model`, `inputTokens`, `cachedTokens`, `outputTokens`, `latencyMs`, `sportmonksCalls` | yalnız işletme metriği |
| **`userId` yok** | Kötüye kullanım için Redis sayaçları yeter. Gerekirse günlük tuzla `hash(userId)`, 30 gün sonra null'lanır |

**KVKK:**
- Kayıt öncesi PII ayıklama: e-posta, telefon, TC kimlik numarası (11 hane + algoritma kontrolü), IBAN, kart numarası, URL ve "@kullanıcıadı" kalıpları `[GİZLİ]` ile değiştirilir.
- Futbolcu adları kişisel veri sayılsa da kamuya açık bilgi oldukları için kalır. Sorunun ana konusu oldukları için silinmeleri işi bozar.
- Saklama süresi: **90 gün**, ardından günlük cron ile silme. İstatistik için yalnız toplu sayılar kalır.
- Aydınlatma: giriş kutusunun altında tek satır ("Sorular hizmeti geliştirmek için kimliksiz olarak 90 gün saklanır") ve gizlilik politikasına bölüm eklenmesi.
- **Yurt dışı aktarım:** soru metni ABD merkezli LLM sağlayıcısına gidiyor. Mevcut AI analizleri kişisel veri göndermiyor, ama serbest metin gönderebilir. KVKK m.9 (2024 değişikliği) kapsamında standart sözleşme ve bildirim gerekip gerekmediğini **hukukçuya teyit ettir**. LLM'e `userId`, e-posta ya da isim gönderilmez; PII ayıklama LLM çağrısından **önce** yapılır.

---

## 4. Maliyet tablosu (aylık; 30 gün)

Varsayımlar:
- Soru başına ortalama 6.000 girdi / 350 çıktı token.
- Günde 100 soruda önbellek isabeti yok; günde 1.000 ve 10.000 soruda önbellek okuması var.
- Hazır soru şablonları ve cevap önbelleğinden gelen tasarruf **dahil değil**; üst sınır gibi okunmalı.

| Kalem | 100/gün (3 bin) | 1.000/gün (30 bin) | 10.000/gün (300 bin) |
|---|---|---|---|
| **LLM: Claude Haiku 4.5** | ~$23 | ~$111 | ~$1.110 |
| LLM: Claude Sonnet 5.5 | ~$60 | ~$288 | ~$2.880 |
| **LLM: gpt-5-mini** | ~$9 | ~$60 | ~$600 |
| LLM: gpt-4.1-mini | ~$9 | ~$48 | ~$480 |
| LLM: gpt-5-nano | ~$2 | ~$12 | ~$120 |
| **Sportmonks** (mevcut Growth €99/ay zaten ödeniyor) | €0 ek | €0 ek | €0 ek (kota yeterli; yoğun maç gecelerini `quotaMonitor` ile izle; gerekirse "extra API calls" eki €29'dan başlıyor) |
| Sportmonks tarihî veri eki (isteğe bağlı) | €29 tek sefer | ← | ← |
| **Embedding** (yalnız pgvector'e geçilirse) | <$0,01 | ~$0,03 | ~$0,25 |
| **Wikipedia** | $0 | $0 | $0 |
| **Vercel** | Hobby $0 | Hobby $0 (sınırda) | Pro $20 (+ ~$8 kullanım, krediden düşer) |
| Redis (Upstash; günlük kota + önbellek) | mevcut plan | mevcut plan | yaklaşık +1–1,5 M komut/ay; Upstash planını kontrol et |
| **Toplam (Haiku)** | **~$23** | **~$111** | **~$1.130** |
| **Toplam (gpt-5-mini)** | **~$9** | **~$60** | **~$620** |

Not: ödeme ya da reklam başlarsa Vercel Pro ($20/ay) soru hacminden bağımsız olarak zorunlu hale gelir.

**Maliyeti düşüren kaldıraçlar** (etkisi büyükten küçüğe):
1. Hazır soru çiplerine şablon cevap: LLM maliyeti 0. Trafiğin tahminen %30–50'si.
2. Cevap önbelleği: anahtar = normalize soru + çözümlü varlıklar + veri sürümü. Aynı maç için tekrar soruları yakalar.
3. Çağrı 1'i daha ucuz bir modelle yapmak (gpt-5-nano ya da Haiku). Çağrı 2 kalite modelinde kalır.

---

## 5. Premium / kredi seçenekleri

Bağlam:
- Bugün "premium" = ADMIN ya da bakiyesi ≥ 100 kredi.
- Paketler 5, 50 ve 100 kredi; fiyat belirlenmemiş. Analiz 5 kredi.
- Kredi TL değeri belirlenmediği için seçenekler **kredi** ve **LLM maliyeti** cinsinden verildi.
- Ücretsiz kotanın en kötü durum maliyeti için örnek: **1.000 aktif ücretsiz kullanıcının hepsi kotasını her gün dolduruyor.**

| Seçenek | Anonim | Kayıtlı ücretsiz | Premium | Ek soru | Ücretsiz kota maliyeti (1.000 kullanıcı, Haiku / gpt-5-mini) | Not |
|---|---|---|---|---|---|---|
| **A: Cömert** | 0 (giriş ister) | 5/gün | 50/gün | 1 kredi = 5 soru | 150 bin soru: ~$555 / ~$300 | Kayıt kancası güçlü; kredi satışını en az zorlar |
| **B: Dengeli** | 0 | 3/gün | 30/gün | 1 kredi = 2 soru | 90 bin: ~$333 / ~$180 | Analiz (5 kredi) ile oran makul: 1 analiz ≈ 10 soru |
| **C: Sıkı + çip** | 0 | 1 serbest soru/gün + **hazır çipler sınırsız** (şablon, LLM yok) | 20/gün | 1 kredi = 1 soru | 30 bin: ~$111 / ~$60 | En düşük maliyet; dönüşüm kancası "serbest soru" |
| **D: Anonim tadım** | 1/gün (IP + Turnstile) | 3/gün | 30/gün | 1 kredi = 2 soru | B + anonim kötüye kullanım riski | Anonim kota için Turnstile'ı soru gönderimine de eklemek gerekir |

**Karar için birim ekonomi.** Kredinin TL değeri K olsun. Ek soru başına maliyet Haiku'da yaklaşık $0,004, gpt-5-mini'de yaklaşık $0,002. Hedef brüt marj ≥ %80 ise "1 kredi = N soru" için şart: **K ≥ 5 × N × soru maliyeti**. Örnek: 1 kredi = 5 soru ve Haiku → K ≥ $0,10.

**Öneriler (karar sende):**
- Başarısız ya da "bilmiyorum" cevapları kota ve krediden **düşülmemeli**. Güven için önemli; maliyeti düşük.
- "Premium = ≥100 kredi" tanımı asistan kotası için tuhaf. Kullanıcı soru sordukça bakiyesi 100'ün altına düşüp premium'luğu kaybeder. Asistan kotası ayrı bir "plan" alanıyla ya da zaman bazlı bir paketle ilişkilendirilmeli.

---

## 6. Fazlı plan

### Faz 0: Ön koşullar (1–2 gün)

**Dosyalar ve işler:**
- `src/lib/credits.ts`: atomik koşullu düşüm, `refundCredits`, tip birliği.
- `analysis.ts`: hata halinde iade.
- `src/server/sportmonks/cachedFetch.ts`: upstream `AbortSignal.timeout`.
- Sportmonks'un ücretli plana geçişinin teyidi.
- Vercel Pro kararı (ödeme ya da reklamla birlikte).

**Riskler:** ortak dosyalar, paralel oturumlarla çakışma. Ayrı commit'ler, yalnız kendi dosyalar.

### Faz 1: MVP, yalnız Katman 1 (8–12 iş günü)

**Soru tipleri (dar):** skor/sonuç, golcüler, kartlar, korner ve temel maç istatistikleri, puan durumu sırası/puanı, gol krallığı, son 5 form, sıradaki maç.

**Dosyalar:**
- **Sunucu:**
  - `src/server/assistant/llm.ts` (Anthropic + OpenAI adaptörü, tool/JSON, stream)
  - `prompts.ts`
  - `entityResolver.ts`
  - `dateResolver.ts`
  - `src/config/teamAliases.ts`
  - `src/config/assistantCoverage.ts`
  - `tools/{findFixture,fixtureFacts,standings,topScorers,teamForm,nextMatch}.ts`, mevcut servisleri sarar; sayma kuralları burada
  - `verifyAnswer.ts`
  - `quota.ts` (günlük kota + $ sigortası)
  - `piiRedact.ts`
- **API:** `src/pages/api/assistant/ask.ts` (SSE), `suggestions.ts`.
- **DB:** `prisma/schema.prisma` → `AssistantQuestion` + migration (senin onayınla).
- **UI:**
  - `KuralKosesi/Panel.tsx` (sekmeler)
  - `KuralTab.tsx`
  - `AssistantTab.tsx`
  - `AnswerCard.tsx`
  - `openEvent.ts`, `Mount.tsx` (payload)
  - `assistant.module.scss`
  - `public/locales/{tr,en}/assistant.json`
  - `src/lib/i18nNamespaces/assistant.ts`
- **Test:**
  - `dateResolver` ve `entityResolver` birim testleri (sabit "şimdi").
  - Kaydedilmiş Sportmonks JSON'larıyla araç testleri (canlı istek yok).
  - `scripts/assistant/eval.ts`: 30 soruluk set; LLM çağrısı yalnız elle çalıştırılır.
- **Ölçüm:** ana sayfa ve maç sayfası Lighthouse (temele göre düşüş yok).

**Riskler:**
- Takma ad ve tarih çözümlemede kenar durumlar.
- Kart/gol sayma tanımı.
- Panel değişikliği Kural Köşesi oturumunun dosyalarına dokunuyor; sıralama gerekir.
- Mobilde klavye ile panel düzeni.

### Faz 2: Katman 2 (4–6 iş günü)

**Dosyalar:**
- `AssistantDocument` + migration (`unaccent`, `pg_trgm`, `turkish` FTS, IMMUTABLE sarmalayıcı).
- `scripts/assistant/sync-docs.ts`.
- Upsert kancası: `analysis.ts` içinde.
- Araçlar: `tools/{matchAnalysis,kuralKosesi,aiAccuracy}.ts`.
- Maç sayfasında `?tab=analysis` derin linki.
- Kural Köşesi'ni belirli kurala açan link (`openEvent` payload'ı).

**Riskler:**
- Analizin "tahmin" olduğunun yanlış anlaşılması (etiket zorunlu).
- Trivia'nın kaynak dışı tutulması.
- Türkçe kökleme kalitesi.

### Faz 3: Katman 3 (3–4 iş günü)

**Dosyalar:**
- `src/server/assistant/wikipedia.ts` (UA, Core REST arama + Action API extract, Redis önbellek, 429 Retry-After).
- `tools/wiki.ts`.
- Cevap kartında CC BY-SA satırı.
- `gizlilik-politikasi` ve `legal.json` güncellemesi.

**Riskler:**
- Uzun maddelerde sorulan olgu giriş bölümünde yok; bölüm araması gerekir.
- TR ve EN maddeler çelişebilir.
- Wikimedia rate limit politikası "deneysel".

### Sonra

Kullanım panosu (admin; cevapsız soru kümeleri), pgvector hibriti (ölçüte göre), Sportmonks tarihî veri eki kararı, native istemci (aynı `/api/assistant/ask`).

---

## 7. Riskler

| # | Risk | Etki | Önlem |
|---|---|---|---|
| 1 | **Uydurma.** LLM facts dışında sayı yazar | Güven kaybı, ürünün temel vaadi | Claims + factPath şeması, sayı/isim doğrulayıcı, toplamaları sunucu yapar, başarısızsa "bilmiyorum" |
| 2 | **Sayma tanımı.** Örnek: 7 / 5 sarı kart; penaltılı gol; VAR düzeltmesi | Doğru veriyle "yanlış" cevap | Sunucuda sabit kurallar, cevapta tanımın açıkça yazılması, değerlendirme setinde özel maddeler |
| 3 | Var olmayan maç ("5 Ekim GS") | Uydurma maç | Tarih çözücü + "maç yok, en yakın şu" şablonu |
| 4 | Boş sonuç ile plan dışının ayırt edilememesi | Yanlış "maç yok" | Yerel kapsam tablosu (lig + sezon derinliği) |
| 5 | Ulusal ligde yalnız 3 sezon, eski ŞL maçlarında istatistik yok | Çok sayıda "bilmiyorum" | Katman 3'e düşüş; €29 tarihî veri eki; cevapsız soru kaydıyla talebi ölçmek |
| 6 | Trivia ve analizin olgu gibi sunulması | İlkenin dolaylı ihlali | Trivia hariç; analiz "tahmin" etiketli |
| 7 | Kredi yarış durumu ve iade eksikliği | Para/kredi kaybı, şikâyet | Faz 0 |
| 8 | Vercel Hobby ticari kullanım yasağı | Hesap kısıtlama | Ödeme veya reklam öncesi Pro |
| 9 | Maliyet patlaması (bot, kötüye kullanım) | Fatura | Giriş zorunlu, kullanıcı/IP limitleri, global $ sigortası, 300 karakter sınırı |
| 10 | Rate limit fail-open (Redis kesintisi) | Kota uygulanamaz | Kredi DB'de; $ sigortası için bellek içi yedek sayaç |
| 11 | Sportmonks upstream'de zaman aşımı yok | Asılı istek, Vercel süresi | Araç başına ~4 sn `Promise.race` |
| 12 | Sağlayıcı seçimi: `getProvider()` OpenAI'yi zorluyor | Yanlış model / maliyet | Asistana ayrı env |
| 13 | KVKK: serbest metin + yurt dışı aktarım | Hukuki | PII ayıklama, kimliksiz 90 gün saklama, aydınlatma, hukukçu teyidi |
| 14 | Sportmonks aboneliği (deneme 1 Ekim'de bitti diye not var) | Veri kesilmesi | Panelden teyit |
| 15 | Wikipedia rest_v1 kullanımdan kaldırılıyor, rate limit politikası deneysel | Kırılma | Core REST + Action API, önbellek, 429'da geri çekilme |
| 16 | Lighthouse gerilemesi | PSI düşüşü | Yalnız Panel içinde `import()`; sayfalara import yok; ölçüm |
| 17 | İsim normalizasyonu (NBSP, ı/İ, aksan) | Eşleşme ve doğrulama hatası | `normalizeSearchText` + NBSP/NFC temizliği hem çözümlemede hem doğrulayıcıda |
| 18 | Paralel oturumlar (Kural Köşesi, takım sayfası) aynı dosyalarda | Çakışma | Panel işi Kural Köşesi oturumu bitince; yalnız kendi dosyalar |

---

## 8. Değerlendirme seti (30 soru)

Bugün = 2 Ekim 2026 (Perşembe). "İstek" sütunu soğuk önbellekte yeni Sportmonks istek sayısıdır; "beklenen" değerler 2026-10-02 verisiyle doğrulandı (yalnız 1–20 için). Puan durumu ve gol krallığı zamanla değişir; değerlendirme betiği bu soruları kaydedilmiş JSON'larla sabitlemeli.

### Katman 1 (20 soru)

| # | Soru | Beklenen kaynak ve cevap | İstek | Olası hata |
|---|---|---|---|---|
| 1 | 5 Ekim'deki Galatasaray maçında kaç sarı kart oldu? | `teams/34` upcoming/latest → **5 Ekim'de maç yok**; en yakın: 9 Eki Kasımpaşa (oynanmadı) | 1 | Uydurma maç ve kart sayısı; yılı yanlış çıkarma |
| 2 | Trabzonspor–Galatasaray maçında kaç sarı kart çıktı? | between + `fixtures/19746609` → oyuncu sarısı TS 4, GS 1; teknik ekip ayrı | 2 | Olaylardan 7 sayma; `addition` sayacını kullanma |
| 3 | Geçen hafta Galatasaray kime yenildi? | 22–28 Eyl aralığında GS maçı yok → "geçen hafta maç yok; son maç 19 Eyl TS 4–0 GS" | 1 | "Geçen hafta"yı son 7 gün sanma; son yenilgiyi uydurma |
| 4 | Cimbom'un son maçı kaç kaç bitti? | Alias 34 → latest → TS 4–0 GS | 1 | Alias eksik → teams/search boş |
| 5 | Trabzonspor–Galatasaray maçında golleri kim attı? | events GOAL → Salah 4', 44', 80'; Saviolo 39' | 2 | İsim yazımı; hat-trick'i 1 gol sayma |
| 6 | GS–Trabzon maçında kaç korner kullanıldı? | stats type 34 → 6 (TS 1, GS 5) | 2 | "Trabzon" belirsizliği (4 aday); ev/deplasman karışması |
| 7 | Süper Lig'de şu an lider kim? | standings 28203 → Amed SK 13 puan (GS da 13, averajla 2.) | 1–2 | Eşit puanı söylememe; eski sezon |
| 8 | Süper Lig gol krallığında kim önde? | topscorers 208 → Orban ve Salah 7'şer gol | 1–2 | Eşitliği gizleme; asist tipini (209) karıştırma |
| 9 | Osimhen bu sezon kaç gol attı? | players/search + statistics 28203 → Süper Lig'de 6 (1'i penaltı); ŞL'de gol yok | 2 | Penaltıyı ayrı sayma; "tüm turnuvalar" diye genelleme; NBSP |
| 10 | Fenerbahçe'nin son 5 maçtaki formu nasıl? | `teams/88` latest → G/B/M dizisi + skorlar | 1 | Kupa ve Avrupa maçlarını karıştırma; sıralamayı ters çevirme |
| 11 | Galatasaray ile Fenerbahçe son 5 maçta kaç kez berabere kaldı? | head-to-head 34/88 → 5 maç (2024-09 sonrası) | 1 | Kapsamın 2024'ten başladığını söylememe |
| 12 | Galatasaray'ın sıradaki maçı ne zaman? | upcoming → 9 Ekim 20:00 (TR), Kasımpaşa, Süper Lig | 1 | UTC saati (17:00) yazma |
| 13 | Dün Süper Lig'de hangi maçlar oynandı? | `fixtures/date` D−1 ve D (UTC) → TR gününe süz | 2 | Gün sınırı; boş günü uydurma |
| 14 | Sporting–Galatasaray maçında topla oynama yüzdesi neydi? | between (ŞL, 9 Eyl) + fixture stats type 45 | 2 | Hangi takımın hangi oranda olduğunu karıştırma |
| 15 | BJK'nın kaç puanı var? | Alias 554 → standings | 1–2 | "BJK" alias'ı; birden fazla lig (ŞL + lig) |
| 16 | Premier Lig'de Arsenal kaçıncı sırada? | teams/search + standings (lig 8) | 2–3 | "Premier Lig" ile Ukrayna Premier Ligi (609) karışması |
| 17 | Real Madrid–Galatasaray 2013 Şampiyonlar Ligi maçı kaç bitti? | between 2013-04 → **iki maç**: 3 Nis Real 3–0; 9 Nis GS 3–2 | 2 | Tek maç varsayma; istatistik sorulursa "yok" diyememe |
| 18 | Galatasaray 2023'te Süper Lig'de Beşiktaş'ı yendi mi? | Kapsam tablosu: ulusal lig < 2024/25 → "bilmiyorum" + kayıt | 0 | Sportmonks boş → "maç yok" deme |
| 19 | Kashima Antlers dün kazandı mı? | teams/search boş + plan dışı → "bilmiyorum" + kayıt | 1 | Genel bilgiyle cevaplama |
| 20 | Trabzonspor–GS maçında kırmızı kart gören oldu mu? | events → Ugochukwu 87' kırmızı; Okan Buruk (teknik direktör) 72' ikinci sarıdan kırmızı; 85'te VAR kart düzeltmesi | 2 | VAR_CARD'ı ayrı kart sayma; teknik direktörü oyuncu gibi yazma |

### Katman 2 (5 soru)

| # | Soru | Beklenen kaynak | İstek | Olası hata |
|---|---|---|---|---|
| 21 | Ofsayt Yok yapay zekâsı GS–Kasımpaşa maçı için ne tahmin ediyor? | K1 ile fixture id → `MatchAnalysis` (PRE) → "tahmin" etiketi + maç linki | 1 | Analiz yoksa uydurma; tahmini olgu gibi sunma; PRE'nin 30 dk süresi |
| 22 | Kaleci topu 8 saniyeden fazla tutarsa ne olur? | Kural Köşesi `kaleci-8-saniye` | 0 | Katman 1'e boşuna gitme; kendi bilgisinden ekleme |
| 23 | Deplasman golü kuralı hâlâ geçerli mi? | Kural Köşesi `deplasman-golu` | 0 | Yıl ya da tarih uydurma |
| 24 | VAR hangi durumlarda devreye girer? | Kural Köşesi `var` | 0 | Maddeyi aşan ayrıntı |
| 25 | Yapay zekâ tahminleriniz ne kadar tutuyor? | `PredictionRecord` toplamı → `/ai-istatistikleri` | 0 | Yüzdeyi kendisi hesaplama (sunucu vermeli) |

### Katman 3 (5 soru)

| # | Soru | Beklenen kaynak | İstek (Wiki) | Olası hata |
|---|---|---|---|---|
| 26 | Galatasaray UEFA Kupası'nı hangi yıl kazandı? | Wikipedia TR "Galatasaray SK" ya da "2000 UEFA Kupası Finali" (1999/2000 Sportmonks'ta yok, AL 2000/01'den başlıyor) | 2 | Sportmonks'ta "bulunamadı" deyip durma; katmana düşmeme |
| 27 | Fenerbahçe hangi yıl kuruldu? | Wikipedia TR | 2 | Giriş bölümünde yoksa uydurma |
| 28 | Türkiye 2002 Dünya Kupası'nda kaçıncı oldu? | Wikipedia TR "2002 FIFA Dünya Kupası" | 2 | Dünya Kupası planda yok; Katman 1'de takılma |
| 29 | Hakan Şükür milli takımda kaç gol attı? | Wikipedia TR/EN | 2–3 | TR ve EN sayı farkı; "Wikipedia'ya göre" dememe |
| 30 | Lefter Küçükandonyadis hangi takımlarda oynadı? | Wikipedia TR | 2 | Liste kırpma; CC BY-SA satırını unutma |

### Uydurmayı yakalama: doğrulayıcı önerisi (`verifyAnswer.ts`)

1. **Yapılandırılmış cevap.** LLM `{answer, claims:[{text, factPath}]}` döndürür. Her `factPath` (JSON pointer) facts içinde gerçekten var olmalı ve `text` o değerle eşleşmeli.
2. **Bağımsız sayı taraması.** Cevap metnindeki tüm rakamlar, Türkçe sayı sözcükleri ("üç", "yedi", "ilk", "ikinci"), dakikalar (`44'`), tarihler ve saatler, yüzdeler ve skor kalıpları (`4–0`) çıkarılır. Her biri, facts içinden **sunucunun düzleştirdiği değer kümesinde** birebir bulunmalı. Toplam, fark ve oran gibi türetilmiş değerleri sunucu önceden hesaplayıp facts'e koyar; LLM aritmetik yapmaz.
3. **İsim taraması.** Büyük harfle başlayan özel adlar (takım, oyuncu, hakem, stadyum) normalize edilir (NFC, NBSP, ı/İ) ve facts'teki isim kümesinde aranır. Yalnız soyadı kullanımına izin verilir.
4. **Kaynak tutarlılığı.** Kart etiketi, aracın döndürdüğü `source` ile aynı olmalı. Wikipedia cevabında CC BY-SA satırı zorunlu.
5. **Başarısızlık akışı:** 1 kez "şu değerler facts'te yok: …" geri bildirimiyle yeniden üretim. Yine başarısızsa şablon cevap (facts'ten deterministik) ya da "bilmiyorum". Olay `outcome=VERIFY_FAILED` ile kaydedilir; değerlendirme setinde bu oran izlenir.
6. **Ölçüt:** 30 soruluk sette **uydurma 0**. Ayrıca doğru cevap ≥ 26/30; "bilmiyorum" yalnız 18, 19 ve verisi gerçekten olmayan maddelerde.

Gerçek bir uydurma örneği de sette hazır: soru 1. Doğrulayıcısız bir model büyük olasılıkla 5 Ekim için bir maç ve kart sayısı uydurur. Facts'te 5 Ekim tarihli maç olmadığı için bu sayı 2. adımda yakalanır.
