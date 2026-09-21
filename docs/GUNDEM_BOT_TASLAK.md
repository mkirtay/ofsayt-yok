# Gündem resmi hesap botu — tasarım taslağı

Durum (2026-09-22): **Adım 1–2 kodlandı, Adım 3 yalnızca tasarım** (migration YOK, prod'a uygulama sahibi tarafından yapılır).
Hiçbir şey otomatik/canlı yayınlanmıyor; taslak üretimi ve yayın ayrı, elle tetiklenen iki çağrı.

## Bugünkü akış (Adım 1–2)
```
GET  /api/admin/gundem/bot-goal-draft?fixtureId=&eventId=   → taslak (salt okunur; body, externalKey, matchId, teamId, facts, warnings)
POST /api/admin/gundem/bot-post {body, externalKey, matchId, teamId}  → yayın (idempotent)
```
Her ikisi `Bearer $CRON_SECRET` ya da ADMIN oturumu ister. Yazar: `GUNDEM_BOT_EMAIL` (varsayılan `bilgi.ofsaytyok@gmail.com`).
Kod: `src/lib/gundem/{official,botAuth,botPost}.ts`, `src/lib/gundem/bot/{goalStanding,goalTemplates,goalDraft}.ts`.

Kurallar (testli): lig/sezon bazlı topscorer (tip 208); kendi kalesine gol kimseye kredi yazmaz; atılan penaltı (tip 16) gol sayılır;
seri penaltı (22/23) ve kaçan penaltı (17) sayılmaz; beraberlikte "ortak lider"; kendi kalesine gol varsa skor satırı yazılmaz;
veri eksikse ilgili cümle YAZILMAZ (uydurma yok). Metin düz template — LLM yok.

## Doğrulanması gereken varsayımlar
1. **Topscorer tablosu canlı maçta güncelleniyor mu?** Bilinmiyor. Varsayılan: güncellenmiyor (maç öncesi durum + olaylardan sayım).
   Canlı güncelleniyorsa `GUNDEM_BOT_TOPSCORERS_INCLUDE_LIVE=true`. Yanlış seçim = sayım kayması (çift ya da eksik sayım).
   Test: canlı bir maçta gol sonrası `topscorers/seasons/{id}` toplamını izle. Tamamlanmış maçlarda taslak üretmek bu soruyu ÇÖZMEZ
   (tablo zaten maçı içerir → "before" yanlış hesaplanır).
2. **Kendi kalesine golde `participant_id`** golü atan mı yiyen takım mı? Doğrulanmadı → skor satırı bu durumda yazılmıyor.
3. Lig adı Sportmonks'tan İngilizce/ASCII geliyor ("Super Lig"); görüntüleme eşlemesi `bot/leagueNames.ts` (league_id anahtarlı, 11 bilinen lig; bilinmeyen lig API adında kalır). Eşleme id'leri logo yollarından/dokümandan türetildi, canlı doğrulanmadı.
4. **Webhook:** Sportmonks v3 dokümantasyonunda webhook/push YOK (bkz. rapor); önerilen yol polling — `GET /livescores/latest`
   (10 sn'lik sabit döngüde güncellenen fixture'lar, `include=events;participants` ile). Enterprise'a özel bir teklif olabilir, panelden/satıştan sorulmalı.

## Adım 3 taslağı — `GundemBotDraft` + onay kuyruğu (UYGULANMADI)
Prisma (yalnızca öneri; `schema.prisma`'ya EKLENMEDİ):
```prisma
enum BotDraftStatus { PENDING APPROVED REJECTED POSTED STALE }

model GundemBotDraft {
  id           String         @id @default(cuid())
  externalKey  String         @unique            // goal:<fixtureId>:<eventId> | ht:<fixtureId> | ft:<fixtureId>
  kind         String                            // "GOAL" | "HT" | "FT"
  fixtureId    Int
  eventId      Int?
  body         String         @db.Text            // şablon çıktısı; onayda elle düzenlenebilir
  facts        Json                               // GoalFacts (denetim için)
  warnings     String[]
  status       BotDraftStatus @default(PENDING)
  postId       String?                            // yayınlanınca Post.id
  decidedById  String?
  decidedAt    DateTime?
  createdAt    DateTime       @default(now())
  @@index([status, createdAt])
  @@index([fixtureId])
}
```
Akış:
1. **Poller** (`/api/admin/gundem/bot-tick`, Bearer CRON_SECRET; tetikleyici: Vercel Pro cron / QStash / harici cron — Hobby cron günde 1):
   `livescores/latest` → yeni gol olayları → `buildGoalDraft` → `GundemBotDraft` upsert (`externalKey` unique = tek kez işleme;
   `P2002` sessizce yutulur). İkinci güvence: (fixture, oyuncu, dakika, skor) imzası (eski `tweet-bot.js` `goalSignature` deseni).
2. **Kuyruk sayfası** `/admin/gundem-kuyruk` (`getServerSideProps` + `requireAdmin`; `middleware.ts` matcher'a `/admin/:path*`):
   PENDING listesi, `warnings` görünür, metin düzenle, Onayla / Reddet.
3. **Onay** `POST /api/admin/gundem/drafts/[id]/approve`: önce **VAR yeniden doğrulaması** (aşağıda), sonra `createBotPost` (mevcut,
   idempotent), draft → POSTED + `postId`. Reddet → REJECTED.
4. İleride tam otomatik: kuyruk aylarca güvenilir çalıştıktan sonra, yalnızca uyarısız + belirli tür taslaklar için otomatik onay.

### VAR yeniden doğrulaması (Adım 3'te uygulanacak; şimdilik yalnızca `goalDraft.ts` içinde TODO)
Onay anında fixture yeniden çekilir (`include=events`); yayın ancak (a) aynı `eventId` hâlâ gol tipinde listedeyse, (b) o golden sonra
aynı takım için VAR (tip 10) olayı yoksa, (c) oyuncu/dakika taslaktakiyle aynıysa yapılır. Aksi halde draft `STALE` olur ve yayınlanmaz.
Taslak metnindeki skor da yeniden hesaplanıp karşılaştırılır (arada başka gol/iptal olmuş olabilir).

### Diğer notlar
- `OFFICIAL_POST` bildirimi hâlâ üretilmiyor; eklenirse yalnızca takipçilere ve düşük hacimle (spam riski).
- Kota: gol başına ≈ 1 Fixture + ~2 Topscorer isteği; sezon tablosu maç başına bir kez önbelleğe alınabilir. Havuzlar bağımsız (2500/saat).
