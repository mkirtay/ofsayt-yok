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
