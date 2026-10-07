# Sentry sorunları — son 14 gün (2026-10-07)

Kaynak: kullanıcının aktardığı Sentry olay sayıları (Sentry API'sine erişimim yok). Kanıtlar: kod, prod Redis
(salt-okuma token'ı), canlı site istekleri, yerel oturum kayıtları. Dal: `fix/sentry-issues-2026-10`.

## 1) `SportmonksHttpError: You have reached your rate limit` — bot-tick 52, `GET /` 3

**Kök neden.** Fixture havuzu (saatlik 2.500) dolunca Sportmonks 429 döner. Paylaşımlı cache 429'u eski veriye
çeviriyordu ama eski veri yoksa (`livescores/inplay` 10 dk saklanır) hata çağırana gidiyordu. Bot dakikada bir tick
atıyor ve her tick `inplay` için yeniden upstream'e gidip 429 alıyor, `captureError('gundem:bot-tick:inplay')` ile
ayrı bir Sentry istisnası yazıyordu → havuz sıfırlanana kadar dakikada 1 olay. Bir tick içindeki sonraki istekler de
(sayfalar, golcü tablosu) yine upstream'e gidiyordu. `GET /`: ana sayfa ISR yeniden üretimi 429 alıp fırlatıyor (Next
son başarılı sayfayı vermeye devam ediyor; doğru davranış, olay seyrek).

**Düzeltme** (`src/server/sportmonks/poolGuard.ts`, `cachedFetch.ts`, `lib/gundem/bot/tick.ts`):
- 429 → **havuz soğuması**: `retry-after` başlığı > havuzun bilinen sıfırlanma süresi > 60 sn ([15 sn, 1 sa]). Soğuma
  Redis'te (`smq:cooldown:<havuz>`), tüm instance'lar görür. Soğumada o havuza hiç istek atılmaz: eski veri varsa o,
  yoksa anında 429. Aynı tick / render içinde tekrar deneme yağmuru olmaz.
- Havuz eşlemesi yanıtlardan öğrenilir (`requested_entity`; başlangıç: `fixtures`, `livescores` → Fixture), çünkü
  429 gövdesi `rate_limit` taşımıyor. `x-ratelimit-remaining` başlığı gelirse o da kullanılır.
- **Seyreltme**: havuzda kalan < %10 → kısa TTL'ler ×3, < %2 → ×6 (en çok 30 dk). Canlı liste 30 sn → 90/180 sn,
  `inplay` 20 sn → 60/120 sn; bot aynı cache'ten okuduğu için dakikalık tick çoğunlukla upstream'e gitmez.
- Bot: tick başında havuz soğumadaysa hiçbir istek atmadan döner (`degraded: 'rate-limited'`); tick içinde 429 gelirse
  Sentry istisnası yazılmaz. Yerine soğuma başına instance'ta **tek** uyarı: "Sportmonks hız sınırı: Fixture havuzu N sn
  bekletiliyor" (parmak izi `sportmonks-rate-limited/<havuz>`).

**Doğrulama.** `tickRateLimit.test.ts` (uçtan uca: gerçek tick → servis → cache → sahte 429): ilk tick en çok 2 istek
(dün + bugün listesi, paralel), soğuma süresince 5 tick'te 0 istek, 0 `captureError`, 1 uyarı; süre bitince yeniden
deneme. `cachedFetch.test.ts`: soğumanın instance'lar arasında paylaşılması, süre önceliği, eski veri, TTL esnetme.

## 2) "Sportmonks kota düşük: Fixture havuzunda 34/2500 ve 109/2500" — `/api/matches/day` 27, `/teknik-direktor/[slug]` 47

**Bulgu.** Uyarının etiketindeki rota **o anda istek atan** rotadır, havuzu tüketen değil: uyarı havuz azaldıktan sonra
ilk istek atan rotaya düşer (instance başına dakikada bir). Koç sayfası (ISR 1 sa + SWR) yeniden üretimde Fixture
havuzundan yalnız 1 `fixtures/multi` harcıyor; tarayıcılar çok sayıda koç sayfasını gezdiği için uyarıyı sık "yakalıyor".

Prod Redis anlık görüntüsü (2026-10-07 20:17 UTC; son 24 saatte yazılan **farklı** anahtar = en az bu kadar upstream
isteği; canlı listelerin tekrar tazelenmeleri görünmez):

| Uç (Fixture havuzu) | Anahtar | Son 24 sa yazılan | Ort. taze süre |
|---|---|---|---|
| `fixtures/{id}` (maç sayfası, tarama) | 5.647 | 2.284 | ~24 sa |
| `fixtures/head-to-head` (maç sayfası H2H) | 587 | 587 | 6 sa |
| `fixtures/multi` (koç / hakem son maçlar) | 391 | 391 | 6 sa |
| `fixtures/between` lig takvimi (sıradaki maç günü) | 318 | 318 | 10 dk |
| `fixtures/date` (ana sayfa, bot) | 46 | 9 | içeriğe göre 30 sn–24 sa |
| `livescores/inplay` | 1 | 1 | 20 sn |

Diğer havuzlar: `coaches/{id}` 689, `referees/{id}` 246 (kendi havuzları). Sonuç: Fixture havuzunu iki şey birlikte
tüketiyor — (a) tarama kaynaklı uzun kuyruk (her yeni maç / H2H / kişi sayfası bir istek), (b) canlı maç saatlerinde
20–30 sn TTL'li çok sayfalı listeler ve iki ayrı `inplay` include'u (ana sayfa + bot). Kesin rota dağılımı için ölçüm
eklendi (aşağıda); deploy sonrası birkaç maç akşamı bekleyip okunmalı.

**Düzeltme.**
- **Ölçüm**: her gerçek upstream isteği saatlik Redis hash'ine `havuz|rota|proxy/server` alanıyla sayılır (429'lar ayrı;
  8 gün). Rota Sentry'nin istek kapsamındaki işlem adından (`POST /api/admin/gundem/bot-tick`,
  `getStaticProps (/teknik-direktor/[slug])`…), yoksa istek yolundan. Instance içinde toplanıp 20 istekte / 15 sn'de bir
  toplu yazılır (yaklaşık; instance kapanırsa son birkaç sayım kaybolabilir).
  Rapor: `GET /api/admin/sportmonks-usage?hours=24` (CRON_SECRET ya da admin) → dönem toplamı + saat saat.
- Mevcut tek-uçuş (instance içi + Redis `SET NX` kilidi) ve SWR korunuyor; üstüne yukarıdaki seyreltme ve soğuma.
- TTL: hepsi bitmiş ve 1 günden eski `head-to-head` / `multi` listeleri 6 sa → 24 sa (sonuç kesin); bir haftadan uzak
  günün `fixtures/date` listesi 15 dk → 6 sa. Koç sayfası SWR tazeliği 1 sa → 6 sa.

**Doğrulama.** `cachePolicy.test.ts` (yeni TTL kuralları), `poolGuard.test.ts` (sayaç: alanlar, 429 ayrımı, saatlik
anahtar ve 8 gün TTL, rapor satırları), `quotaMonitor.test.ts` (rota tespiti). Canlı etki: deploy sonrası rapor ucu.

## 3) `/teknik-direktor/[slug]`: `TypeError: Cannot read properties of null (reading 'useContext')` 45, "veri alınamadı: 476109" 3

**Kök neden (useContext).** Prod hatası değil — **yerel ölçüm sunucusu**. 2026-10-04'te teknik direktör sayfaları
geliştirilirken worktree derlemesi ana deponun `next` ikilisiyle başlatılmıştı (`npx next start <worktree>` →
iki React kopyası). Çalışma anında üretilen ISR sayfaları (`/teknik-direktor`, `/hakem`, `/teams`…) bu hatayla 500
verir; önceden üretilmiş sayfalar çalıştığı için fark edilmez. Oturum kaydında aynı hata seri halde var (2026-10-04
12:20 UTC). `.env.local`'daki `NEXT_PUBLIC_SENTRY_DEBUG=true` yerel sunucunun Sentry'ye göndermesini açıyor
(environment `development`).
Canlıda kontrol: `/teknik-direktor/christakis-christoforou-476109` ISR MISS'te 200 render ediyor (başlık doğru).

**"veri alınamadı: 476109".** Profil isteği geçici hatayla (429 / zaman aşımı) düştüğünde ve Redis'te sayfanın eski
verisi yokken `getStaticProps` bilerek fırlatıyor (500 → arama motoru yeniden dener; 404 önbelleğe girmesin, yeniden
üretimde ise Next eski sayfayı korur). Davranış doğru; sıklığı 1. ve 2. maddedeki düzeltmelerle azalır. Bu 3 olayın
prod mu yerel mi olduğunu Sentry'deki `environment` etiketi gösterir.

**Düzeltme.** Kodda değişiklik gerekmiyor. Yerelde worktree derlemesi daima kendi ikilisiyle başlatılmalı:
`<worktree>/node_modules/.bin/next start <worktree>`. Yerel ölçümlerde Sentry kapatılmalı (bkz. 4).

## 4) `PrismaClientInitializationError: Can't reach database server at 127.0.0.1:1` — `GET /api/matches/19745050/analysis` 24, son 4 gün önce

**Kök neden.** Yerel ölçüm oturumu. `127.0.0.1:1` adresi yalnızca oturumların yerel `next build` / `next start`
komutlarında geçiyor (`DATABASE_URL=postgresql://x:x@127.0.0.1:1/x` — prod DB'ye dokunmamak için kasıtlı sahte adres).
2026-10-03'te maç sayfası evre metinleri işi için yerel sunucu bu adresle açılıp `/matches/19745050-eldense-real-oviedo`
ziyaret edildi; sayfa istemcide `/api/matches/19745050/analysis`'i çağırdı → Prisma bağlanamadı. Sentry sunucu
yapılandırması yalnız Vercel'de gönderir, ama `.env.local`'daki `NEXT_PUBLIC_SENTRY_DEBUG=true` yerelde de açıyor.

**Tekrar eder mi.** Evet — yerel ölçüm sahte DB ile ve `NEXT_PUBLIC_SENTRY_DEBUG=true` açıkken her yapıldığında.
Prod'u etkilemez (environment `development`).

**Öneri** (Sentry yapılandırması güvenlik oturumunun alanı, dokunulmadı): `.env.local`'dan
`NEXT_PUBLIC_SENTRY_DEBUG=true` satırını kaldırmak ya da yerel ölçüm komutlarına
`NEXT_PUBLIC_SENTRY_DEBUG= SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=` eklemek; Sentry uyarı kurallarında
`environment:production` süzgeci.

## 5) "Zamanlanmış iş 585 dk çalışmamış" (evaluate-predictions, analysis-pregenerate)

**Kök neden (kapandı).** 81e658a öncesinde cron yolunda nabız arka plan işinin sonunda yazılıyordu; Vercel yanıt
sonrası arka planı dondurunca hiç yazılmıyordu → nabız yalnız elle çalıştırmalarda ilerliyor, sonraki tick "585 dk
çalışmamış" diyordu (~9,75 sa = son elle çalıştırmadan beri).

**Teyit.** 81e658a `origin/main`'de. Prod Redis nabzı (2026-10-07 20:23 UTC): iki işte de `trigger: "cron"`,
`phase: "done"`, `lastRunAt` 20:15 UTC (8 dk önce; 15 dk'lık cron'la uyumlu). Yani cron tick'leri artık nabız yazıyor,
45 dk eşiği aşılmıyor. Sentry'de 2026-10-06 21:19 (deploy) sonrası yeni olay olmaması beklenir; Sentry'yi okuyamadığım
için bu son adım panelden teyit edilmeli.

## 6) Upstash "Max Request Size 10 MB" uyarısı (2026-10-07)

**Sınırı aşan işlem: benim tanı betiğim.** 2026-10-07 ~20:16 UTC'de (23:16 TSİ) yukarıdaki anlık görüntü için prod
Redis'e salt-okuma token'ıyla 200 anahtarlık tek bir `MGET` attım. Upstash bunu reddetti:
`ERR max request size exceeded. Limit: 10485760 bytes, Actual: 11245919 bytes` (yanıt boyutu da sayılıyor). Uyarı zamanı
bununla örtüşüyorsa kaynak budur; uygulamanın yazdığı hiçbir tek değer bu boyuta yaklaşmıyor.

**Redis'e yazan yerler ve prod'daki gerçek boyutlar** (11.126 anahtar; `STRLEN`, salt-okuma):

| Yazan | Anahtar | Toplam | En büyük | Koruma (önce → şimdi) |
|---|---|---|---|---|
| `cachedFetch` → `smc:football/fixtures/{id}` | 5.747 | 188,7 MB | 166 KB | 900 KB → gzip + 900 KB |
| `smc:…/fixtures/multi` | 478 | 15,4 MB | 121 KB | aynı |
| `smc:…/head-to-head` | 607 | 8,6 MB | 94 KB | aynı |
| `smc:…/fixtures/between` (lig takvimi) | 323 | 8,1 MB | 87 KB | aynı |
| `smc:…/teams/{id}` | 140 | 5,5 MB | 181 KB | aynı |
| `smc:…/fixtures/date` | 46 | 4,3 MB | **289 KB** (en büyük) | aynı |
| `smc:…/coaches`, `referees` | 2.311 | 5,7 MB | 43 KB | aynı |
| `swrCache` (koç / hakem sayfası, hakem tablosu) | 1.269 | 5,0 MB | 29 KB | yok → 900 KB |
| `refereePage` takım kırılımı | 43 | 0,3 MB | 19 KB | yok → 900 KB |
| `livescoreCache` (gündem akışı, oyuncu maçları, bot golcüleri) | — | küçük | — | yok → 900 KB |
| `newsCache` | 1 | küçük | — | yok → 900 KB |
| Kilitler (`smc-lock`, swr `:lock`, cron, analiz), cron nabzı, rate limit, `sessionVersion`, AI kotası, `smq:*` | — | bayt düzeyi | — | gerek yok |

**Gerçek riskler (uygulama tarafı):**
1. **Otomatik pipeline.** `@upstash/redis` 1.38'de `enableAutoPipelining` varsayılan olarak açık ve `lib/redis.ts` bunu
   kapatmıyor. Aynı mikro-görev turundaki bütün komutlar (en çok 1.000) tek HTTP isteğinde birleşiyor, 10 MB sınırı
   bu toplam için geçerli. Tek bir aşırı büyük birleşik istek, içindeki her komutu düşürür.
2. **Devre kesici.** `withRedis` her hatayı sayıyordu: birleşik istekte 3+ komut düşerse devre açılır ve instance 30 sn
   boyunca Redis'i hiç denemez. O sürede cache okumaları hep MISS olur ve her istek Sportmonks'a gider. Tek
   instance'ın bütün L1 dışı trafiği.
3. **Depolama: 251,6 MB / 256 MB (Free).** Yalnız değer baytı; anahtar yükü hariç. Dolarsa yazmalar reddedilir
   (eviction kapalıysa). Eski davranışta bu da devre kesiciyi açardı.

**Düzeltme:**
- `lib/redis.ts`: `MAX_REDIS_VALUE_BYTES` (900 KB, UTF-8 JSON baytı) + `fitsInRedis`. Boyut kaynaklı hatalar
  (`max request size`, `max db/data size`, `OOM`) devre kesiciyi **açmaz**; yalnız o komut atlanır.
- `cachedFetch`: 4 KB'tan büyük gövde gzip + base64 (`gz`) yazılıyor. Gerçek verideki oran: `fixtures/date` 242→37 KB
  (6,5×), takım 180→17 KB (10,9×), `fixtures/{id}` 22→4 KB (5,4×), H2H 13→3 KB. gunzip en büyükte 0,3 ms.
  Eski sıkıştırılmamış kayıtlar okunmaya devam ediyor, bozuk `gz` cache yokmuş gibi yenileniyor. `zlib`,
  `process.getBuiltinModule` ile alınıyor (`require` tarayıcı paketine 300 KB `browserify-zlib` ekliyordu; build'de
  doğrulandı, statik toplam temel değerle aynı: 6.280 KB).
- `swrCache`, `livescoreCache`, `newsCache`, `refereePage`: sığmayan değer yazılmıyor; bellek / yeniden üretim kullanılıyor.

**Yazma düşerse ne olur (testle doğrulandı):**
- 500 yok: `withRedis` asla fırlatmıyor.
- Aynı instance Sportmonks'a tekrar gitmiyor: L1, Redis yazımından önce dolduruluyor. Negatif cache (404) de L1'de.
- Başka instance'lar yeniden ister (paylaşımlı kopya yok). Bu 900 KB üstü (artık sıkıştırılmış) yanıtlar için geçerli
  ve pratikte hiç yok.

Testler: `redis.test.ts` (boyut hatası devreyi açmıyor, bayt hesabı), `cachedFetch.test.ts` (gzip gidiş-dönüş, eski
kayıt, max-request-size'da L1 HIT, negatif cache), `swrCache.test.ts` (sığmayan değer yazılmıyor).

**Beklenen depolama:** Sıkıştırmayla `smc:*` ~245 MB → ~45–55 MB; toplam ~60–70 MB. Eski kayıtlar en çok 7 günde
(`fixtures/{id}` saklama süresi) yenileriyle değişir. Deploy'dan sonraki ilk günlerde sınır hâlâ yakın, bu yüzden
Upstash konsolunda **eviction'ı açmak** (dolunca reddetme yerine en eski anahtarı atma) önerilir.

### Bu hata Sportmonks havuz tüketimini / rate limit olaylarını açıklıyor mu?

**Hayır, kanıtlar buna işaret etmiyor:**
- 10 MB'ı aşan bilinen tek istek uygulamanın değil, betiğin; uygulamanın en büyük tek değeri 289 KB.
- Redis yazmaları çalışıyor: 2026-10-07 21:02 UTC'de en sıcak anahtar 0,5 dk önce yazılmıştı. Cron nabzı 21:00 UTC.
- Bot-tick 429 olayları 14 gün boyunca birikti; tek seferlik bir Redis hatası bunu açıklamaz.

**Ama mekanizma koda gerçekten vardı:** otomatik pipeline (risk 1) + devre kesici (risk 2) → 30 sn boyunca tüm okumalar
MISS → Sportmonks'a yığılma. Depolama dolduğunda (risk 3) yazmalar düşse de okumalar sürerdi; ama devre kesici açıldığı
için okumalar da kesilirdi. Bu zincir artık kırıldı. Vercel Logs'ta `[redis] art arda 3 hata` satırı geçmişte bu
olayların olup olmadığını gösterir; ben okuyamıyorum.

### Redis komut kullanımı tahmini (Free: aylık 500 bin komut, 256 MB — konsoldan teyit edilmeli)

| Kaynak | Komut / olay | Günlük tahmin |
|---|---|---|
| `cachedFetch` MISS (upstream): GET + kilit SET NX + SET + DEL (+ soğuma GET ≤1/5 sn/havuz) | 4–5 | 5–25 bin MISS → 25–110 bin |
| `cachedFetch` Redis HIT (L1 dışı) | 1 | 5–25 bin |
| bot-tick (2 dk = 720/gün): soğuma GET + 2 gün listesinin sayfaları (L1 soğuksa) | 3–12 | 2–9 bin; canlı maçta + inplay MISS |
| Cron (2 iş × 96 tick + GitHub yedeği): kilit, nabız GET/SET×2, DEL | ~5 | ~1–2 bin |
| Rate limit (`fixedWindow`, CDN'e takılmayan API isteği) | 1–2 | trafiğe bağlı, birkaç bin |
| `sessionVersion` (girişli istek) | 1 | birkaç yüz–bin |
| AI kotası: kontrol 2 GET + kayıt 2×(INCRBY+EXPIRE) (+ atomik sayaç) | ~6–8 / mesaj | mesaj sayısı × 7 |
| `smq` ölçüm (yeni): 20 istekte bir HINCRBY×alan + EXPIRE | ~0,2 / MISS | 1–5 bin |

**Toplam:** günde ~40–150 bin → ayda ~1,2–4,5 milyon. Bu, aylık 500 bin Free sınırının **2–9 katı**. Yazmaların hâlâ
başarılı olması bununla çelişiyor. Ya plan sınırı farklı, ya trafik tahminden düşük (L1 isabeti yüksek), ya da
ay içinde sınıra henüz gelinmedi. Kesin sayı Upstash konsolunun Usage sekmesinde. Sınır aşılırsa Upstash bütün
komutları reddeder → cache kapanır → Sportmonks havuzu hızla tükenir. Bu, rate limit olaylarının olası bir kök
nedeni olarak **konsoldan kontrol edilmeli**. Komut azaltma seçenekleri: MISS başına kilit SET+DEL'i yalnız kısa TTL'li
(canlı) anahtarlarda kullanmak (−2/MISS), L1'i "eski ama kullanılabilir" kayıtları da tutacak şekilde genişletmek.
