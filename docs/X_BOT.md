# X (Twitter) botu

`@getscor3` için otomatik tweet: **gol** ve **maç sonu** (görselli). Onay adımı yok (karar 2026-10-21).

## Çalışma
- `POST /api/admin/x/tick` — dakikada bir harici cron (cron-job.org), `Authorization: Bearer $CRON_SECRET`, adres `https://www.getscor3.com/api/admin/x/tick` (www ile).
- Veri: Gündem botuyla aynı `livescores/inplay` (paylaşımlı önbellek). Maç sonu: maç inplay'den düşünce `resolveLiveMatch` FINISHED ise; görsel sitenin OG kartı (`renderMatchOgImage`).
- Güvenlik ağları: gol 2 ardışık tick'te görünürse atılır (VAR iptali elenir) · bota girişte maçta olan goller atılmaz (baseline) · tick başına en çok 3 tweet · Redis `SET NX` ile mükerrer yok · Redis/anahtar yoksa tweet yok.
- Ana tweet'te bağlantı YOK (X bağlantılı gönderiyi çok daha pahalı faturalıyor).

## Env (Vercel, Production)
| Değişken | Anlam |
|---|---|
| `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET` | OAuth 1.0a, uygulama izni **Read and write** |
| `X_BOT_MODE` | yok / `off` = kapalı · `dry` = üretir, atmaz (yanıtta döner) · `live` = atar |
| `X_BOT_LEAGUE_IDS` | isteğe bağlı, varsayılan `600,2,5` (Süper Lig, Şampiyonlar Ligi, Avrupa Ligi) |

## Test
1. `X_BOT_MODE=dry` + cron çalışsın: yanıttaki `summary.dry` üretilecek tweet'leri gösterir, hiçbir şey atılmaz.
2. Elle tek tweet (X_BOT_MODE'dan bağımsız): `POST /api/admin/x/test` gövde `{"kind":"goal"|"final","fixtureId":19873251,"minute":2,"post":false}` → metni döner; `"post":true` GERÇEKTEN atar.
3. Hazır olunca `X_BOT_MODE=live`.
