# Yasal notlar — avukata sorulacaklar

Bu dosya kodda karar verilmemiş, hukukçu görüşü gereken soruları toplar. Kod tarafı yalnız teknik seçeneği uygular;
süre ve dayanak yazılmaz. Yasal sayfalarda bu sorulara karşılık gelen yerler `[HUKUKİ METİN EKLENECEK: …]`
yer tutucusuyla işaretli (`public/locales/{tr,en}/legal.json`).

> Not: `.claude/worktrees/legal-pages` (c4b6a44) dalındaki daha geniş dosyanın hâlâ geçerli soruları aşağıdaki "Ödeme ve satış
> belgeleri" bölümüne taşındı (2026-10-16, WEB-ODEME); o dal artık birleştirilmeyecek.

## Hesap silme ve saklama süreleri

Tarih: 2026-10-14. Teknik ayrıntı ve veri envanteri: `docs/HESAP_SILME_VE_ONAY.md`. Uygulama:
`src/server/account/deleteAccount.ts` (web profil + mobil aynı uç: `DELETE /api/user/me`).

Bugünkü davranış (kodda): silme ANINDA ve kalıcı; gecikmeli silme / bekleme süresi yok.

| Veri | Kodda ne oluyor | Soru |
|---|---|---|
| Hesap (e-posta, ad, kullanıcı adı, bio, avatar, şifre özeti), oturumlar, Google bağlantısı | Silinir | — |
| Kredi bakiyesi ve kredi defteri (CreditTransaction: SIGNUP_BONUS, ANALYSIS_SPEND, PURCHASE, REFUND …) | Silinir | 1. Satın alınmış kredinin defter satırları (PURCHASE / REFUND) sipariş kaydı dışında ayrıca saklanmalı mı? Kullanılmamış satın alınmış kredi silmede iade gerektirir mi (ödeme bugün kapalı)? |
| Sipariş kayıtları (PaymentOrder: tutar, paket, durum, tarihler, Hikie işlem no) | Saklanır; kullanıcıyla bağlantı koparılır ("Silinmiş kullanıcı" yer tutucusuna devredilir) | 2. Saklama süresi ve hukuki dayanak (VUK / TTK / 6502 / Mesafeli Sözleşmeler Yönetmeliği)? 3. Alıcı kimliği (ad / e-posta) siparişle birlikte saklanmalı mı, yoksa kimliksiz kayıt + Hikie'deki fatura yeterli mi? |
| Gündem gönderi ve yorumları, eski maç yorumları | Silinmez; yazar "Silinmiş kullanıcı" yapılır, metin aynen kalır | 4. Anonimleştirme bu biçimde yeterli mi? Metnin içinde kişisel veri (kendi adı, telefon vb.) olabilir — silme seçeneği sunulmalı mı ("gönderilerimi de sil")? |
| Beğeniler, takipler, bildirimler, push belirteçleri, anket oyları, Frikik skorları, açılan analizler, favoriler | Silinir | — |
| Denetim kaydı (AccountDeletionLog: kanal, giriş yöntemi, hesap yaşı, sayılar) | Kişisel veri YOK; kişiyle eşleştirilemez | 5. Silme talebinin ispatı için kişiyle eşleştirilebilir bir kayıt (ör. e-postanın tuzlu özeti) tutulmalı mı? Tutulursa süresi? |
| Silme onay e-postası (Resend) | Silme sonrası gönderilir | 6. Resend'in gönderim kayıtlarında e-posta adresi kalır — veri işleyen sözleşmesi / süre? |
| Yedekler (Supabase), hata kayıtları (Sentry — kişisel veri gönderilmez), sunucu günlükleri (Vercel) | Kodla silinemez | 7. Yedeklerden silinme süresi metinde nasıl ifade edilmeli? |
| Aynı e-postayla yeniden kayıt | Serbest (2 kredi kayıt bonusu yeniden alınabilir) | 8. Kötüye kullanımı önlemek için e-postanın özetini tutmak meşru menfaat sayılır mı? |

Genel: 9. "Hesabımı sil" ile KVKK md. 11 silme başvurusu aynı şey mi sayılır (yanıt süresi 30 gün kuralı)? Yasal
saklama gereken veriler için kullanıcıya silme anında ayrıca bilgi verilmeli mi (şu an profil formunda ve onay
e-postasında kısa açıklama var)?

## Ödeme ve satış belgeleri (WEB-ODEME, 2026-10-16)

> **2026-10-19 — yer tutucular kaldırıldı, satış açılıyor (kullanıcı kararı).** Satıcı kimliği yalnız marka adı + alan adı +
> resmi e-posta (`config/seller.ts`: name / website / email); unvan, adres, vergi, MERSİS, telefon, KEP yok. Tüm
> `[HUKUKİ METİN EKLENECEK: …]` ve `[GÜNCEL PARASAL SINIR]` yerlerine metin yazıldı, `draftNotice` ve `review` rozetleri
> silindi, `LEGAL_EFFECTIVE_DATE` 2026-10-19. Seçilen politikalar: kullanılmamış kredi kural olarak iade edilmez (hesabı biz
> kapatırsak bedeli iade); hatalı / mükerrer tahsilat 3 iş günü inceleme + 14 gün içinde karta iade; sipariş kayıtları 10 yıl,
> güvenlik kayıtları ≤ 2 yıl, yedekler ≤ 30 gün; Hakem Heyeti sınırı rakamsız ("her yıl ilan edilen"). **Avukat incelemesi
> yapılmadı**; aşağıdaki sorular ve satıcı kimliği hâlâ açık — bilgiler gelince `seller.ts`'e alan eklenip metinler güncellenmeli.

Kapsam: Ön Bilgilendirme Formu (`/on-bilgilendirme-formu`, yeni), Mesafeli Satış Sözleşmesi (yeniden yazıldı), /credits satın
alma onay kutusu + sunucu kapısı, sipariş onay e-postası, gizlilik / KVKK veri alıcıları tablosu. Hepsi TASLAK; satış
`PAYMENTS_ENABLED` kapalı olduğu için canlıda görünmez (yalnız metin sayfaları erişilebilir, noindex).

### Tek kaynaklar (kod)

| Olgu | Kaynak |
|---|---|
| Satıcı kimliği (yer tutucular) + `LEGAL_EFFECTIVE_DATE` (2026-10-16) | `src/config/seller.ts` → yasal metinlerde `{{seller.*}}`, e-postada `sellerLine` |
| Satın alma onayı sürümü (`PURCHASE_TERMS_VERSION` = yürürlük tarihi), belge yolları | `src/config/legalConsent.ts` |
| Paketler ve fiyatlar (KDV dahil) — yasal sayfalardaki tablo | `src/config/creditPackages.ts` |
| Veri alıcıları tablosu (koddan çıkarıldı, kanıtlar dosya başında) | `src/config/dataProcessors.ts` |
| Onay kaydı: `PaymentOrder.termsAcceptedAt` / `termsVersion` (sunucu yazar) | `src/server/payments/paymentOrders.ts` `createCheckout` |
| Sipariş onay e-postası (bir kez, TR/EN) | `src/server/payments/orderConfirmationEmail.ts` |

Yer tutucu kaldığı sürece satıcı bilgisi geçen her yasal sayfa (Gizlilik dahil) `noindex` olur ve en üstte "TASLAK — avukat
onayı bekliyor" notu görünür; hukuki iddia içeren bölümler "Avukat onayı bekler" rozetiyle işaretli (`legal.json` → `"review": true`;
avukat onaylayınca rozet bu alan silinerek kaldırılır, `draftNotice` da güncellenir).

### Doldurulacak yer tutucular

| Yer tutucu | Nerede | Nasıl doldurulur |
|---|---|---|
| `[ŞİRKET/KİŞİ ÜNVANI]` `[ADRES]` `[VERGİ DAİRESİ]` `[VERGİ NO]` `[MERSİS NO]` `[TELEFON]` `[İLETİŞİM E-POSTASI]` `[KEP ADRESİ]` | Tüm satış / gizlilik / KVKK / iade sayfaları, sipariş e-postası | Yalnız `src/config/seller.ts` |
| `[GÜNCEL PARASAL SINIR]` | Mesafeli Satış §9, Ön Bilgilendirme §7 | `public/locales/{tr,en}/legal.json` (her yıl Ticaret Bakanlığı ilanı) |
| `[HUKUKİ METİN EKLENECEK: Hikie'nin ticari unvanı, ülkesi ve ödeme kuruluşu lisans bilgisi]` | Satış belgeleri "Ödeme" | `legal.json` |
| `[HUKUKİ METİN EKLENECEK: istisnanın kullanılmamış krediler bakımından kapsamı …]` | Cayma hakkı bölümleri | Avukat metni |
| `[HUKUKİ METİN EKLENECEK: yaş sınırı …]`, `[… sözleşmenin saklanması ve kalıcı veri saklayıcısı …]` | Mesafeli Satış §8, §11 | Avukat metni |
| `[HUKUKİ METİN EKLENECEK: sağlayıcıların sunucu konumları ve KVKK md. 9 …]` | Gizlilik §5, KVKK §6 | Avukat + sağlayıcı panelleri (Vercel / Supabase / Upstash / Resend bölgeleri) |

Satışı açmadan önce: yukarıdakiler dolmalı, `review` rozetleri avukat onayıyla kalkmalı, `LEGAL_EFFECTIVE_DATE` güncellenmeli
(eski sekmeden gelen checkout 409 `PURCHASE_TERMS_OUTDATED` alır, yeniden onay ister).

### Avukata sorulacaklar

1. **Cayma hakkı metni:** Krediler için Mesafeli Sözleşmeler Yönetmeliği md. 15/1-ğ (anında teslim edilen gayrimaddi mal) ve
   15/1-h (onayla ifasına başlanan hizmet) dayanağı doğru mu? Krediler hesaba anında yüklenir ama ayrı ayrı (1 kredi = 1 analiz)
   ve süresiz harcanır: **hiç kullanılmamış krediler** için cayma hakkı / iade sunmak zorunlu mu? Onay cümlesi (/credits'teki kutu:
   "…kredilerin anında yükleneceğini ve bu nedenle cayma hakkımın sona ereceğini kabul ediyorum") yeterli mi; ayrı bir "ifanın hemen
   başlamasını onaylıyorum" kutusu gerekir mi?
2. **Onay kaydı:** Zaman + metin sürümü saklanıyor (IP saklanmıyor). Yeterli mi? Ön bilgilendirmenin kalıcı veri saklayıcısıyla teyidi
   (md. 7) için sipariş e-postasında belgelerin bağlantısı yeterli mi, metnin kendisi (PDF / gövde) gönderilmeli mi?
3. **Ödeme düğmesi (md. 8):** "Ödeme yükümlülüğü içeren sipariş" ibaresi bizim düğmede mi ("Satın al") olmalı, Hikie sayfası yeterli mi?
4. **Tüketici Hakem Heyeti:** Parasal sınır metne rakamla mı yazılmalı (her yıl güncelleme) yoksa "Bakanlıkça ilan edilen" yeterli mi?
5. **Fatura / vergi yükümlülüğü:** Satıcı şahıs işletmesi mi şirket mi; e-arşiv fatura kesilecek mi, kim keser (Hikie mi biz mi)?
   Fatura için TCKN / VKN / adres toplanacaksa KVKK metnine veri kategorisi ve checkout'a alan eklenmeli. "KDV dahil" fiyat
   gösterimi ve KDV oranı doğrulanmalı. MERSİS / KEP zorunlu mu?
6. **Saklama süreleri:** Sipariş / ödeme kaydı, onay kaydı, kredi defteri, sipariş e-postası (Resend kayıtları) için yasal süre ve
   dayanak (VUK / TTK / 6502 / Yönetmelik md. 18?). Hesap silmede sipariş kaydı anonimleştirilerek saklanıyor — uyumlu mu?
7. **Yaş sınırı:** Satın alma için yaş sınırı konulmalı mı, nasıl beyan / doğrulama?
8. **Yurt dışı aktarım (KVKK md. 9):** Tablodaki ABD / AB sağlayıcıları (Vercel, OpenAI, Anthropic, Sentry, Resend, Upstash,
   Cloudflare, Google, Hikie?) için dayanak; VERBİS gerekir mi?
9. **Satıcı ile ödeme kuruluşu ilişkisi:** Hikie'nin rolü (aracı ödeme kuruluşu / pazar yeri) sözleşmede nasıl tanımlanmalı?

### Bilinen sınırlamalar (teknik)

- Hikie dönüş adresindeki `customerEmail` / `checkoutLinkToken`: tarayıcı adres çubuğundan ve geçmişten hemen silinir, Vercel Web
  Analytics'e ve Sentry'ye gitmez, `Referrer-Policy: no-referrer`. **Vercel'in kendi istek kayıtları** (CDN / fonksiyon logları)
  ilk isteğin tam adresini görebilir — kodla kapatılamaz; Hikie panelinde başarılı dönüş adresi `/api/payments/hikie/callback`
  yapılırsa ve Hikie bu parametreleri oraya da eklerse durum aynıdır (fonksiyon logu). Hikie'den parametresiz dönüş istenebilir.
