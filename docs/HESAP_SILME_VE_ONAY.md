# Hesap silme ve Kullanım Şartları onayı (WEB-HESAP, 2026-10-14)

Kapsam: kullanıcının kendi hesabını silmesi (web + mobil aynı uç), Google ile ilk girişte / onaysız eski hesaplarda
onay adımı, mobil için yalnız rapor (C). Hukuki sorular: `docs/YASAL_NOTLAR.md` → "Hesap silme ve saklama süreleri".

## A1. Veri envanteri (User'a bağlı her şey)

| Tablo / yer | Alanlar (kişisel) | İlişki (silmede) | Karar | Gerekçe |
|---|---|---|---|---|
| `User` | email, emailNormalized, name, username, bio, image, password (bcrypt), favoriteTeamIds/LeagueIds, signupUtm*, firstTouchAt, termsAcceptedAt/Version, credits, premiumUntil, referralCode, referredById, tokenVersion | — | **Sil** | Hesabın kendisi |
| `Account` | Google `providerAccountId`, access/refresh/id_token | CASCADE | **Sil** | Google bağlantısı |
| `Session` | sessionToken (JWT stratejisinde kullanılmıyor) | CASCADE | **Sil** | Oturum |
| `VerificationToken` | identifier = e-posta / `reset:` + e-posta | FK yok | **Sil** (kodla) | E-postayı içerir |
| `PostLike`, `MatchCommentLike` | kullanıcı–içerik bağı | CASCADE | **Sil** | Etkileşim |
| `Follow` (iki yön) | takip ilişkisi | CASCADE | **Sil** | Sosyal graf |
| `Notification` (alıcı) | — | CASCADE | **Sil** | Kişisel kutu |
| `Notification` (aktör) | actorId | SET NULL | **Anonimleştir** | Alıcının bildirimi kalır, aktör boş |
| `PushToken` | Expo cihaz belirteci, platform | CASCADE | **Sil** | Cihaz kimliği |
| `CreditTransaction` | bakiye defteri (bonus, harcama, satın alma, iade) | CASCADE | **Sil** (avukata soruldu: PURCHASE/REFUND satırları) | Hesap verisi; mali kayıt PaymentOrder'da |
| `AnalysisUnlock` | açılan analizler | CASCADE | **Sil** | Kullanım geçmişi |
| `PremiumGrant` | premium değişiklikleri | CASCADE | **Sil** | Hesap verisi |
| `UserPrediction` | maç anketi oyu | CASCADE | **Sil** | Toplam oy biraz düşer, kabul |
| `FrikikDailyScore` | günlük skor (tabloda username) | CASCADE | **Sil** | Skor tablosundan düşer (önbellek ≤ 30 sn) |
| `Post` (Gündem) | gövde (serbest metin) | — | **Anonimleştir**: yazar → "Silinmiş kullanıcı" | İstenen: gönderiler kaybolmasın |
| `PostComment` | gövde | — | **Anonimleştir** (aynı) | Aynı |
| `MatchComment` (eski, salt okunur) | gövde | — | **Anonimleştir** (aynı) | Aynı |
| `Post/PostComment/MatchComment.deletedByUserId` | moderasyon yapan | SET NULL | **Boşalt** | Yalnız yöneticiler; yönetici silinemez |
| `PaymentOrder` | tutar, paket, durum, tarihler, merchantOrderId, Hikie işlem no | — | **Koru, bağı kopar**: userId → yer tutucu | Mali kayıt; süre avukatta |
| `Referral` | referrerId / refereeId (FK yok) | — | **Sil** (iki yön) | Kişiler arası bağ |
| Diğer kullanıcıların `referredById` | silinen kullanıcının kimliği | — | **Boşalt** | Kopuk kimlik kalmasın |
| `GundemBotDraft.decidedById`, `CreditTransaction.actorId` | yönetici kimliği | — | Dokunulmaz | Yalnız yöneticiler; yönetici silinemez |
| `MatchAnalysis`, `PredictionRecord`, `MatchTrivia`, `MatchSnapshot` | — | kullanıcıya bağlı değil | Dokunulmaz | — |
| `UserBlock` (iki yön; WEB-GUNDEM 2026-10-16) | engelleyen / engellenen | CASCADE (+ kodla sayılır: `blocksDeleted`) | **Sil** | Sosyal graf |
| `ContentReport.reporterId` (verdiği şikâyetler) | neden, isteğe bağlı not | SET NULL (kodla: `reportsAnonymized`) | **Anonimleştir** | Şikâyet kuyruğu / karar kaybolmasın; not kişiyi göstermez |
| `ContentReport.targetUserId` (hakkındaki şikâyetler) | — | kodla boşaltılır | **Boşalt** | İçerik yer tutucuya geçti; şikâyet içerik kimliğiyle kalır |
| `GundemMention` (etiketlendiği satırlar) | — | CASCADE (kodla: `mentionsDeleted`) | **Sil** | Metin düz "@ad" kalır, bağlantı ve bildirim kalkar |
| `ModerationAction.targetUserId` | yönetici işlem kaydının hedefi | SET NULL (kodla) | **Boşalt** | Denetim kaydı kalır (işlem, zaman, yönetici) |
| `User.gundemSuspendedUntil` | Gündem yazma askısı | satırla | **Sil** | Hesap verisi |
| `AccountDeletionLog` (YENİ) | kişisel veri YOK | — | Yazılır | Denetim izi |
| Redis | `session-version:{id}` (60 sn), hız sınırı sayaçları, `frikik:attempts:{id}:{gün}` | TTL | Oturum sürümü **hemen silinir**; diğerleri TTL ile düşer | — |
| Sentry / Vercel günlükleri / Supabase yedekleri / Resend gönderim kaydı | — | kod dışı | — | Avukata soruldu (yedek süresi, Resend) |
| Tarayıcı (localStorage / sessionStorage) | favori, dil, tema | istemci | — | Cihazda kalır, sunucuya bağlı değil |

Yer tutucu "Silinmiş kullanıcı": `config/deletedUser.ts` — id `deleted-user`, e-posta `deleted-user@deleted.invalid`,
şifresiz, OAuth hesabı yok (giriş yapılamaz), ilk silmede `upsert`. Tüm silinenler TEK satıra devredilir → içerik
kişi bazında gruplanamaz. Profil uçları (`/api/gundem/users/deleted-user/*`) ve sayfası 404; bildirim yazılmaz; web
"Silinmiş kullanıcı" çevirisini gösterir ve profil bağlantısı vermez (`author.deleted: true`, yeni ve isteğe bağlı alan).
**Bu satır silinmemeli** (PaymentOrder CASCADE).

Korunan hesaplar (403 `PROTECTED_ACCOUNT`): yönetici, resmi Gündem hesabı (bot yazarı), yer tutucunun kendisi.

## A2. Uç ve akış

`DELETE /api/user/me` — web oturum çerezi ya da mobil `Authorization: Bearer`.

| Durum | Yanıt |
|---|---|
| Başarılı | 200 `{ ok: true, deleted: true, emailSent }` |
| Onay yanlış | 400 `{ code: 'CONFIRM_MISMATCH' }` |
| Yönetici / resmi | 403 `{ code: 'PROTECTED_ACCOUNT' }` |
| Oturum yok / silinmiş | 401 |
| Hız sınırı (kullanıcı başına 15 dk'da 5) | 429 + `Retry-After` |

Gövde: `{ "confirm": "<hesabın e-postası>" }` ya da `{ "confirm": "SİL" }` ("sil", "SIL" de olur). Şifre istenmez
(Google ile girenler için aynı akış). Mobil: gövdeli DELETE gönderebilmeli (fetch destekler); başarıda yerel belirteci
silmeli — sunucuda belirteç zaten geçersiz (sonraki istek 401).

Sıra (tek transaction): yer tutucu upsert → gönderi / yorum / maç yorumu / sipariş devri → davet ve doğrulama
belirteçleri → `User` silme (CASCADE) → `AccountDeletionLog`. Sonra `session-version` önbelleği silinir (web jwt
kontrolü `SessionRevokedError`, mobil belirteç `null`) ve onay e-postası gönderilir (Resend; hata silmeyi geri almaz,
adres loglanmaz). Hata Sentry'ye ham gönderilmez: yalnız Prisma kodu / hata türü (`captureWarning`), istek gövdesindeki
`confirm` alanı Sentry temizleyicisinde gizli.

Web: Profil › Bilgilerim › "Hesabı sil" (iki adım; düğme onay metni doğru olana dek pasif) → başarıda `signOut` → ana
sayfa.

## B. Google ilk girişi / eski hesaplar — onay

- JWT'ye `termsAccepted` (giriş anında kullanıcı satırından, 60 sn tazelemede DB'den; `update({ termsAccepted })`
  tetiği beklemeden DB'den okur — istemci değeri yazılmaz). Oturumda `session.user.termsAccepted`.
- `TermsConsentGate` (\_app): oturum açık + `termsAccepted === false` → tarayıcı oturumu başına BİR kez
  `/auth/onay?callbackUrl=…` (sessionStorage `oy_terms_prompted_v1`). Giriş / onay / yasal / iletişim / yönetim
  sayfalarında yönlendirmez. Kilitleme yok: "Şimdi değil" ile devam.
- `/auth/onay`: kutu (Kullanım Şartları + Gizlilik bağlantılı) → `POST /api/user/terms-consent { acceptedTerms: true }`
  → `termsAcceptedAt = şimdi`, `termsVersion = TERMS_CONSENT_VERSION` (güncel sürümle zaten onaylıysa değişmez).
- Kapı (`lib/termsConsentGate.ts`): onaysız WEB isteği → 403 `TERMS_REQUIRED`: analiz açma (POST
  `/api/matches/[id]/analysis`), Gündem gönderi ve yorum. Okuma, gezinme, giriş, beğeni, takip, anket etkilenmez.
  Gönderi alanı 403'te "Şartları onayla" bağlantısı gösterir. Satın alma: ödeme kapalı ve Hikie akışına dokunulmadı —
  açılırken `createCheckout` başına `requireTermsConsent` eklenmeli (tek satır).
- **Mobil Bearer istekleri kapıdan muaf** (yayındaki sürümlerde onay ekranı yok). Mobil giriş/kayıt uçlarına dokunulmadı.

## C1. Mobil kayıt: Turnstile yerine ne?

Bugün: `POST /api/mobile/auth/register` web ile aynı `checkSignupTurnstile`'ı çağırır; uygulama belirteç üretemediği
için prod'da 400 → mobil "Üye Ol" web kayıt sayfasını açıyor.

| Seçenek | Koruma | Maliyet / risk | Not |
|---|---|---|---|
| **Apple App Attest + Google Play Integrity** | Yüksek: isteğin gerçek, değiştirilmemiş uygulamadan geldiği kanıtlanır | Yüksek: iki platform SDK'sı (Expo'da config plugin / native modül), sunucuda Apple CBOR/x5c zinciri ve Google API anahtarı; emülatör / root'lu cihaz / eski Android reddi; Play Integrity günlük kota | Doğru uzun vadeli çözüm; bot kayıtları ciddileşince |
| **E-posta doğrulama kodunu öne almak** (önce 6 haneli kod, sonra hesap) | Orta: tek kullanımlık e-posta ile bot hâlâ mümkün; ama doğrulanmamış hesap hiç oluşmaz | Düşük-orta: yeni iki uç (`/mobile/auth/register/start` → kod, `/verify` → hesap + belirteç), Resend maliyeti; hız sınırı şart | Kayıt bonusu zaten yalnız doğrulanmış e-postaya → bot ödülü düşük |
| **Hız sınırı + cihaz kimliği** | Düşük: cihaz kimliği istemciden gelir, taklit edilebilir | Çok düşük | Tek başına yetmez; diğerlerine ek |

**Öneri:** kısa vadede ikinci seçenek + üçüncüsü: mobil kayıtta Turnstile yerine **önce e-posta kodu** (kod 10 dk,
e-posta başına 3, IP başına 10/saat), atılabilir e-posta listesi (`lib/disposableEmail.ts`) ve cihaz başına sınır;
hesap ancak kod doğrulanınca açılır (bonus da o anda). App Attest / Play Integrity'yi ikinci aşamaya bırak (Expo için native
App Attest / Play Integrity modülü seçilince), önce "log modu"nda ölç.

**`acceptedTerms`'ü mobil kayıtta zorunlu yapmak (mevcut istemciyi bozmadan):**
1. Sunucu, geriye uyumlu ilk adım (HENÜZ YAPILMADI — mobil uçlara dokunulmadı): `acceptedTerms === true` gelirse `termsAcceptedAt/termsVersion` yaz; gelmezse kaydı yine aç ama
   onaysız bırak (yayındaki sürüm bozulmaz). Bu hesaplar web'de onay sayfasını görür.
2. Mobil yeni sürüm: kayıt formunda kutu + `X-App-Version` başlığı (ya da `appVersion` alanı) gönderir; ayrıca
   `POST /api/user/terms-consent` (hazır, Bearer kabul eder) ile onay ekranı (Google / eski hesaplar için).
3. Sunucu sürüm kapısı: `appVersion >= N` ise `acceptedTerms` zorunlu (400 `TERMS_REQUIRED`); daha eskiler serbest.
4. Geçiş süresi (ör. 30 gün ya da yeni sürümün kullanıcıların ~%90'ına ulaşması) sonra: başlıksız / eski sürüm kayıtları
   426 `UPGRADE_REQUIRED` ile güncellemeye yönlendirilir; aynı anda `lib/termsConsentGate.ts`'teki Bearer muafiyeti
   kaldırılır (onaysız mobil hesap yazma uçlarında 403 → uygulama onay ekranını açar).
5. `/api/mobile/auth/me` yanıtına `termsAccepted` eklenmesi (mobilin onay ekranını ne zaman açacağını bilmesi için) —
   bu iş kapsamında mobil uçlara dokunulmadı.

Google ile mobil giriş (madde 3 / mobil liste): `POST /api/mobile/auth/google { idToken, acceptedTerms }` — Google
`idToken` sunucuda doğrulanır (aud = iOS/Android istemci kimlikleri), web ile aynı hesap bağlama kuralları
(`lib/oauth.ts`); Google eklenirse App Store "Sign in with Apple" da ister.

## C2. Hız sınırları ve CGNAT

Bugün neredeyse tüm herkese açık uçlar **IP başına** (`requestIp` = `x-forwarded-for` ilk değeri, Vercel'de güvenilir):
Sportmonks vekili 100/dk, `matches/day` ve `matches/[id]/live` 120/dk, Gündem akışı 120/dk, oyuncu / hakem / derbi
60/dk, anket, kayıt 5/15 dk, mobil giriş, şifre sıfırlama… Kullanıcı başına olanlar: Gündem gönderi / yorum, analiz
açma, profil, şifre, hesap silme, push kaydı.

Risk: Türk mobil operatörlerinin çoğu CGNAT kullanır; yüzlerce abone aynı genel IPv4'ü paylaşır. Canlı maç akşamı tek
bir CGNAT IP'si arkasındaki 50 kullanıcı canlı skor sayfasında 15–30 sn'de bir yoklarsa (her biri birkaç uç) 120/dk
sınırı dakikalar içinde dolar → masum kullanıcılar 429 alır (mobil uygulama ve mobil web aynı). Kayıt / giriş gibi
sıkı sınırlar (5/15 dk) aynı IP'den gelen meşru kayıtları da keser. IPv6 kullanan istemcilerde risk düşük.

Alternatif (hesap / cihaz bazlı, katmanlı):
1. Oturum / Bearer varsa anahtar **kullanıcı kimliği** (`rl:<uç>:user:<id>`), sınır kişi başına (ör. 120/dk); IP
   sınırı yalnız oturumsuz istekler için ve CGNAT payıyla **gevşek** (ör. 600/dk) — kötüye kullanım için ayrı tavan.
2. Oturumsuz mobil için imzalı **cihaz kimliği** (uygulama ilk açılışta sunucudan HMAC'li rastgele kimlik alır;
   `X-Device-Id`), anahtar cihaz; imza tutmazsa IP'ye düşülür.
3. Kayıt / giriş gibi uçlarda IP sınırı kalır ama e-posta / hesap başına sınırla birlikte (giriş zaten iki katmanlı:
   `login:ip` + `login:acct`).
4. Önce ölçüm: 429 yanıtlarını uç + "oturumlu mu" + IP'nin /24'ü ile sayan bir sayaç (PII'siz), bir maç akşamı.

En küçük çalışan adım: `hitFixedWindowRateLimit` çağrılarını `rateLimitKey(req, auth)` yardımcısıyla sar — kimlik varsa
kullanıcı, yoksa IP; önce yüksek trafikli 4 uç (Sportmonks vekili, `matches/day`, `matches/[id]/live`, Gündem akışı).

## C3. Push bildirim göndericisi

Var olan: `PushToken` tablosu (token tekil, platform, `disabledAt`), `POST/DELETE /api/push/register`,
`Notification` satırları (`createNotification`: beğeni, yorum, takip; resmi gönderi türü tanımlı). Silmede belirteçler
CASCADE ile gider.

Eksik: gönderen kod yok — Expo Push API çağrısı, makbuz (receipt) kontrolü, `DeviceNotRegistered` → `disabledAt`,
tercih / sessiz saat, tetik (bildirim olayı, maç olayları), kuyruk.

En küçük çalışan çözüm:
1. `server/push/expo.ts`: `sendExpoPush(messages)` — `https://exp.host/--/api/v2/push/send`'e 100'lük paketler,
   `EXPO_ACCESS_TOKEN` (push güvenliği açıksa), 5 sn zaman aşımı; bilet yanıtında `DeviceNotRegistered` → o belirteçte
   `disabledAt = now`.
2. `createNotification` sonunda `waitUntil` (Vercel) ile en iyi çaba: alıcının etkin belirteçlerine kısa Türkçe metin
   ("@ali gönderini beğendi"); yalnız `POST_COMMENT` ve `FOLLOW` ile başla (beğeni gürültülü), kişisel veri olarak
   yalnız kullanıcı adı.
3. Makbuz kontrolü: mevcut harici cron (cron-job.org) ile 15 dk'da bir `/api/cron/push-receipts` — bilet kimlikleri
   Redis'te 1 gün; `DeviceNotRegistered` → `disabledAt`.
4. Kullanıcı tercihi (`User.pushPrefs` JSON ya da ayrı tablo) ve maç olayı (gol) bildirimleri sonraki adım; maç
   olayları için Gündem bot tick'i (`gundem_bot_trigger`) doğal tetik.
Tahmini: 1–2 iş günü (1–3), tercih ekranı + gol bildirimi ayrıca.
