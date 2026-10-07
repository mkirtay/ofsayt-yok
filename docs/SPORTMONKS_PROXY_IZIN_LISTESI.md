# Sportmonks proxy izin listesi — mod ve enforce geçişi

`/api/sportmonks/[...path]` (web tarayıcısı + mobil uygulama) isteklerini `src/server/sportmonks/proxyAllowlist.ts`
süzer.

## Mod (kod, 2026-10-07)

| `SPORTMONKS_ALLOWLIST_MODE` | Davranış |
| --- | --- |
| **tanımsız** ya da `log`/`off` dışındaki her değer (`enforce` dahil) | **enforce**: listede olmayan path/include/filtre → **403**, upstream'e gitmez. Sentry'ye `warning` düzeyinde olay gider (`sportmonks.allowlist_mode=enforce`) |
| `log` | Engellemez, upstream'e gider; Sentry'ye `info` düzeyinde olay |
| `off` | Liste kapalı; yalnız güvensiz istekler loglanır |

- Kod varsayılanı **enforce**'tur (0cac591, 2026-10-04'ten beri). Yani env'i SİLMEK de enforce demektir.
- Moddan BAĞIMSIZ her zaman **400**: `..`/`.` segmenti (`%2E%2E`, `%2e%2e` dahil — Next çözer), çift kodlama
  (`%252E` → `%`), segment içinde `/` (`%2F`), `\`, `?`, `#`, `%`, kontrol karakteri, boş segment, Unicode nokta/eğik
  çizgi benzerleri (`．` `‥` `。` `／` `＼` `％` …, NFKC sonrası da), tekrarlanan parametre.
- Sentry olayları imza başına instance'ta 10 dk'da bir (konsol logu her seferinde). Olaydaki
  `sportmonks.allowlist_mode` etiketi o anki modu gösterir — `info` görüyorsan prod `log` modunda çalışıyor demektir.
- Hız sınırı: IP başına 100 istek/dk (`sportmonks:{ip}`); Redis yanıt vermezse fail-open.
- CDN: yalnız 200 yanıt `public, s-maxage=…` alır (cachePolicy TTL'i; canlı ≤ 15 sn). Diğer her yanıt `no-store`.

## Enforce geçişi (kullanıcı yapar)

1. **Bu dalı deploy et** (izin listesi genişletmesi: takım aramasında `& ( ) , ’` ve NFD aksanlar; yol normalizasyonu).
   Vercel → Project → Settings → Environment Variables'ta `SPORTMONKS_ALLOWLIST_MODE` şu an ne ise öyle kalsın.
   Prod'da `log` ise **24–48 saat** Sentry'de `Sportmonks proxy izin listesi dışı` olaylarını izle:
   - Uygulamanın kendi çağrıları (web `src/services/**`, mobil `ofsaytyok-native/src/services/**`) artık hiç
     görünmemeli. Görünürse `violations` ekindeki include/filtreyi koddaki sabitle karşılaştır, gerçekten gönderiliyorsa
     `proxyAllowlist.ts`'e (joker olmadan) ve `clientRequests.allowlist.test.ts`'e ekle.
   - `football/odds/...`, `bookmakers`, `..` gibi olaylar uygulamadan gelmez (tarayıcı/bot taraması) — beklenen.
2. **Enforce'a al**: Vercel'de `SPORTMONKS_ALLOWLIST_MODE` değişkenini **Production** ve **Preview** ortamlarında ya
   **sil** (kod varsayılanı enforce) ya da değerini `enforce` yap. Development (yerel) için gerekmez.
3. **Redeploy** (env değişikliği yeni deploy'a kadar etkisizdir): Deployments → son prod deploy → Redeploy.
4. **Doğrula** (örnek; kendi alan adınla sen çalıştır):

   ```bash
   BASE=https://<alan-adı>
   # izinli → 200
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/sportmonks/football/leagues/600?include=seasons"
   # izin listesi dışı → 403 (log modunda 200 olurdu)
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/sportmonks/football/odds/bookmakers"
   # yol atlama → 400 (her modda)
   curl -s -o /dev/null -w '%{http_code}\n' --path-as-is "$BASE/api/sportmonks/football/%252E%252E/odds"
   # takım araması (& içeren) → 200
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/sportmonks/football/teams/search/Brighton%20%26%20Hove"
   # önbellek başlığı: 200'de public, hata yanıtında no-store
   curl -sI "$BASE/api/sportmonks/football/odds/bookmakers" | grep -i cache-control
   ```

   Sonra siteyi ve mobil uygulamayı gez (ana sayfa, maç detayı sekmeleri, takım sayfası sekmeleri, oyuncu, puan
   durumu, gol krallığı, başlık araması); Sentry'de `sportmonks.allowlist_mode=enforce` + uygulamanın kendi yolu olan
   olay çıkmamalı.
5. **Geri dönüş**: meşru bir istek 403 alıyorsa Vercel'de `SPORTMONKS_ALLOWLIST_MODE=log` (Production) yap ve
   redeploy et — kod değişikliği gerekmez. Eksik izni ekleyen düzeltme deploy edilince 2–3. adımları tekrarla.
