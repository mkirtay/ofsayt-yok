# Yasal notlar — avukata sorulacaklar

Bu dosya kodda karar verilmemiş, hukukçu görüşü gereken soruları toplar. Kod tarafı yalnız teknik seçeneği uygular;
süre ve dayanak yazılmaz. Yasal sayfalarda bu sorulara karşılık gelen yerler `[HUKUKİ METİN EKLENECEK: …]`
yer tutucusuyla işaretli (`public/locales/{tr,en}/legal.json`).

> Not: `.claude/worktrees/legal-pages` (c4b6a44, main'e alınmadı) dalında aynı adlı daha geniş bir dosya var. O dal
> alınırsa iki dosya birleştirilmeli (aynı yol → add/add çakışması beklenir; bu bölüm olduğu gibi korunur).

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
