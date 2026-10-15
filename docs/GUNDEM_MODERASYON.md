# Gündem moderasyonu (WEB-GUNDEM, 2026-10-16)

Şikâyet, engelleme, içerik filtresi, @etiket, yönetici denetimi. Mobil sözleşme aşağıda (§ Mobil — madde 24);
mobil deposundaki `docs/WEB_CHANGES_FOR_MOBILE.md` §24 önerisinin uygulanmış hâli ve farkları.

## Bileşenler

| Konu | Yer |
|---|---|
| Sayılar (24 saat, eşik 3, bağlantı sınırı, 5 etiket …) | `src/config/moderation.ts` (eşik: `MODERATION_REPORT_THRESHOLD`, 2–50) |
| Temel kelime listesi (testli) | `src/config/moderationTerms.json` |
| Kod değişmeden ek / istisna | `ModerationTerm` tablosu ← `/admin/sikayetler` › Kelime listesi (60 sn önbellek) |
| Filtre (saf) | `src/lib/moderation/textFilter.ts` (+ `textFilter.test.ts`: 120 durum, yanlış pozitifler dahil) |
| Yazma kapısı | `src/lib/moderation/contentGate.ts` |
| Şikâyet / eşik / otomatik işaret | `src/lib/moderation/reports.ts` |
| Yönetici kuyruğu / işlemler / kayıt | `src/lib/moderation/admin.ts`, `/admin/sikayetler` |
| Görünürlük (gizli içerik, engel) | `src/lib/gundem/visibility.ts` (tek NOT EXISTS; N+1 yok) |
| Engel | `src/lib/gundem/blocks.ts` |
| Etiket | `src/lib/gundem/mentions.ts`, `src/utils/mentions.ts` |
| Yönetici e-postası (toplu, 30 dk'da en fazla 1) | `src/lib/moderation/adminAlert.ts` — alıcı `MODERATION_ALERT_EMAIL`, yoksa marka iletişim adresi |

## Kurallar (özet)

- AĞIR (küfür, cinsel, nefret, tehdit) → 400 `CONTENT_REJECTED` (kelime söylenmez). ORTA (hakaret sınırı, spam kelimesi,
  yıldızla sansürlü küfür, >3 bağlantı, 24 sa içinde aynı metin) → yayın + `ContentReport` `source: AUTO`.
- Yeni hesap (< 7 gün) en fazla 1 bağlantı → 400 `LINK_LIMIT`. Aynı kullanıcı aynı metni 10 dk içinde → 409 `DUPLICATE_CONTENT`.
- Reddedilen / işaretlenen içerik `ModerationStat`'ta gün + yüzey + kategori + sayı (kişisel veri yok).
- Profil: ad, kullanıcı adı, bio (PATCH `/api/user/me` ve kayıt) AĞIR → 400 `CONTENT_REJECTED` (`field`); kayıtta kullanıcı
  adı ayrıca `checkNickname` (ayrılmış adlar) → 400 `USERNAME_NOT_ALLOWED`.
- Eski maç yorumları (`MatchComment`): yazma ucu YOK (salt okunur, hiçbir sayfa da göstermiyor) → filtre uygulanacak yer yok.
- Şikâyet eşiği: aynı içeriğe 3 FARKLI kullanıcıdan AÇIK şikâyet → `hiddenAt` (`hiddenReason: REPORTS`); yönetici
  "Şikâyeti reddet" derse geri açılır. Otomatik işaretler eşiğe sayılmaz.
- Engel tek yönlü süzer (engelleyen görmez); engellenene hiçbir yanıtta söylenmez.
- Askı: `User.gundemSuspendedUntil` (9999-12-31 = kalıcı) → gönderi / yorum 403 `GUNDEM_SUSPENDED`; giriş ve okuma açık.

## Mobil — madde 24 (uygulanan sözleşme)

Hepsi web oturumu **veya** mobil `Authorization: Bearer` ile çalışır. Mevcut yanıtlar bozulmadı; yalnız isteğe bağlı alanlar eklendi.
Kullanım Şartları onay kapısı şikâyet / engel uçlarında YOK.

| Uç | Gövde / parametre | Başarılı yanıt | Hatalar |
|---|---|---|---|
| `POST /api/gundem/reports` | `{ targetType: 'POST' \| 'COMMENT' \| 'USER' (büyük/küçük harf fark etmez), targetId, reason: 'HARASSMENT' \| 'HATE' \| 'SPAM' \| 'SEXUAL' \| 'VIOLENCE' \| 'MISINFO' \| 'OTHER', note?: string (≤ 500, düz metin) }` | 201 `{ ok: true, reportId }`; aynı hedefi yeniden: 200 `{ ok: true, duplicate: true }` | 401; 400 `INVALID_REPORT`; 400 `CANNOT_REPORT_SELF`; 404 `NOT_FOUND`; 429 `RATE_LIMITED` + `Retry-After` (20 / saat) |
| `POST /api/gundem/users/{userId}/block` | — | 200 `{ blocked: true }` (idempotent; iki yönlü takip silinir) | 401; 400 `CANNOT_BLOCK_SELF`; 400 `CANNOT_BLOCK` (resmi hesap); 404 `NOT_FOUND` (yok / silinmiş kullanıcı); 429 |
| `DELETE /api/gundem/users/{userId}/block` | — | 200 `{ blocked: false }` (idempotent) | 401; 429 |
| `GET /api/gundem/blocks?cursor=` | — | `{ items: [{ user: { id, name, username, image, official, deleted }, blockedAt }], nextCursor }` | 401 |
| `GET /api/gundem/users/search?q=` | `q`: 1–30 harf / rakam / `_` (baştaki `@` atılır) | `{ items: [{ id, username, name, image }] }` (≤ 8; silinmiş, iki yönde engelli ve kendisi hariç) | 401; 429 (60 / dk) |
| `GET /api/gundem/users/{userId}` (mevcut) | — | `user` içine **`blockedByMe: boolean`** | — |

Mevcut yanıtlara eklenen isteğe bağlı alanlar:

- Gönderi (akış, detay, profil akışı, oluşturma yanıtı) ve yorum: `mentions: [{ username, userId }]` — metin düz
  `@kullaniciadi` olarak kalır; yalnız listedekiler bağlantıya çevrilir. `underReview: true` yalnız gizlenmiş içeriğin
  YAZARINA döner (diğerleri o içeriği hiç almaz).
- Bildirim türleri: `MENTION` (aktör + `post`), `MODERATION_WARNING` (aktör `null`, `post` `null`) — tanınmayan türleri
  atlayan mevcut istemciler etkilenmez.
- Yazma uçlarında yeni hata kodları: 400 `CONTENT_REJECTED`, 400 `LINK_LIMIT`, 409 `DUPLICATE_CONTENT`,
  403 `GUNDEM_SUSPENDED` (+ `suspendedUntil` ISO). `error` her zaman Türkçe, gösterilebilir.

Mobil öneriden (§24) farklar — bilinçli kararlar:

1. **Engel tek yönlü süzer.** İstek: "engellenen kişiye engellendiği açıkça söylenmesin". Bu yüzden beni engelleyenin
   profili 404 olmaz, gönderileri gizlenmez, engelli tarafın yorum / beğeni / takibi 403 `BLOCKED` almaz; bunun yerine
   engelleyene hiçbir bildirim gitmez ve engelleyen o içeriği görmez. Etiket önerisi ve etiket doğrulaması iki yönde de
   engelliyi dışlar (istekteki "engellenen kişi engelleyeni etiketleyemez").
2. Yönetici uçları `/api/admin/moderation/*` (kuyruk hedef başına gruplu); sayfa `/admin/sikayetler`.
3. Şikâyet edene sonuç bildirimi yok (Apple istemiyor).
