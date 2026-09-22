# Gündem resmi hesap botu — tasarım taslağı

Durum (2026-09-22): **Adım 1–3 kodlandı.** Migration dosyası hazır (`prisma/migrations/20260922120000_add_gundem_bot_draft`) ama **prod'a UYGULANMADI** —
sahibi uygular. Hiçbir şey otomatik yayınlanmıyor: poller yalnızca PENDING taslak yazar, yayın yalnızca admin onayıyla (`/admin/gundem-kuyruk`).

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
4. **Webhook:** Sportmonks v3 dokümantasyonunda webhook/push YOK; yol polling. `livescores/latest` yalnızca SON 10 SN'de güncellenen fixture'ları
   verir → dakikalık tetiklemede olay kaçırır. Bu yüzden poller `GET /livescores/inplay?include=participants;league;events` (TAM durum) kullanır ve
   farkı `externalKey` ile çıkarır. Enterprise'a özel bir teklif olabilir, panelden/satıştan sorulmalı.

## Adım 3 — `GundemBotDraft` + onay kuyruğu (KODLANDI; migration prod'a uygulanmadı)
Prisma (`schema.prisma`'da; SQL: `prisma/migrations/20260922120000_add_gundem_bot_draft/migration.sql`):
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
1. **Poller** (`POST /api/admin/gundem/bot-tick`, yalnızca Bearer CRON_SECRET; tetikleyici: cron-job.org, 1 dk):
   `livescores/inplay` (yalnızca takip edilen ligler, `src/config/gundemBot.ts`) → yeni gol olayları → `buildGoalDraft` → `GundemBotDraft` upsert (`externalKey` unique = tek kez işleme;
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

## Endpoint listesi
| Endpoint | Yetki | Not |
|---|---|---|
| `GET /api/admin/gundem/bot-goal-draft?fixtureId=&eventId=` | cron/admin | salt okunur taslak |
| `POST /api/admin/gundem/bot-post` | cron/admin | idempotent elle yayın |
| `POST /api/admin/gundem/bot-tick` | YALNIZCA cron (Bearer) | poller; query'de sır → 400 |
| `GET /api/admin/gundem/drafts?status=PENDING\|POSTED\|REJECTED\|STALE\|all&cursor=` | admin | kuyruk listesi (sayfa: 20) |
| `PATCH /api/admin/gundem/drafts/[id]` `{body}` | admin | yalnızca PENDING, 280 sınırı |
| `POST /api/admin/gundem/drafts/[id]/approve` | admin | atomik claim → VAR/olay doğrulaması → `createBotPost` → POSTED; bozuksa STALE (409) |
| `POST /api/admin/gundem/drafts/[id]/reject` | admin | PENDING → REJECTED |
Sayfa: `/admin/gundem-kuyruk` (yalnızca ADMIN; maç adı, dakika, uyarılar, düzenleme, "Maç sayfasını aç" = uygulamanın kendi `/matches/{fixtureId}` sayfası;
Sportmonks'un herkese açık maç sayfası yok, API URL'leri token içerdiği için gösterilmez).

## Kurulum / işletme
1. Migration'ı sahibi uygular: `prisma migrate deploy` (yalnızca yeni tablo + enum; mevcut tablolara dokunmaz).
2. Env: `CRON_SECRET` (zaten var), `SPORTMONKS_API_KEY`, opsiyonel `GUNDEM_BOT_EMAIL`, `GUNDEM_BOT_LEAGUE_IDS` (varsayılan: 600,606,8,82,564,384,301,2,5),
   `GUNDEM_BOT_TOPSCORERS_INCLUDE_LIVE` (varsayılan false; bkz. varsayım 1).
3. **cron-job.org**: URL `https://<alan-adı>/api/admin/gundem/bot-tick` (query YOK), yöntem POST, aralık 1 dk, ileri ayarlarda başlık
   `Authorization: Bearer <CRON_SECRET>`. Sır ASLA URL'ye yazılmaz (URL'ler loglanır); uç, query'de secret/token/key/auth/password geçen istekleri 400 ile reddeder.
   Başarısız yanıtlar için cron-job.org'da e-posta bildirimi açın.
4. Poller maç yokken de dakikada 1 `inplay` isteği atar (Fixture havuzu, 2500/saat kotasının ~%2'si); takip edilen lig maçı yoksa DB'ye dokunmaz.

## Bilinen kısıtlar
- İlk tick'te (ya da kesintiden sonra) maç ortasında yakalanan eski goller `backlog:` uyarısıyla taslak olur; fixture başına tick başına en fazla 5.
- VAR doğrulaması sezgisel: golden sonraki 10 dk içinde aynı takım için herhangi bir VAR (tip 10) olayı taslağı eskitir (yanlış-olumlu güvenli taraf).
- **Kökteki `middleware.ts` `src/` dizini nedeniyle Next tarafından yüklenmiyor** (dev'de `/profile` girişsiz 200 dönüyor, `/api/admin/*` yanıtları handler'dan geliyor).
  Bot uçları bundan bağımsız: her handler kendi yetki kontrolünü yapar.
