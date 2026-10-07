# Sportmonks API anahtarı rotasyonu

Neden: güvenlik raporu Y1. Upstream istekleri `?api_token=<anahtar>` ile gidiyordu. Sunucu Sentry'si
fetch breadcrumb'ına sorguyu (`data["http.query"]`) yazdığı için anahtar Sentry olaylarına düşmüş olabilir.
`security/a-sentry-scrub` dalında anahtar artık `Authorization` başlığıyla gidiyor ve Sentry olayları derin
temizleniyor. Bu düzeltme yayına çıktıktan **sonra** anahtar yenilenmeli; eski anahtar sızmış kabul edilir.

> Bu belgede hiçbir anahtar değeri yoktur, eklenmemelidir.

## 1. Anahtarın okunduğu yerler

### Ortam değişkeni

| Ad | Durum |
|---|---|
| `SPORTMONKS_API_KEY` | Tek anahtar adı. Yalnız sunucuda okunur, `NEXT_PUBLIC_` öneki yok. |
| `NEXT_PUBLIC_SPORTMONKS_ENABLED` | Sır değil (yalnız sağlayıcı bayrağı); rotasyonda değişmez. |
| `SPORTMONKS_UPSTREAM_BASE` | Sır değil; yalnız yük betikleri için sahte upstream adresi. |
| `LIVESCORE_API_*`, `API_FOOTBALL_KEY` | Eski / rafta sağlayıcılar; Sportmonks anahtarı değil, kapsam dışı. |

Repo'nun izlenen dosyalarında ve git geçmişinde anahtar değeri **yok** (2026-10-07'de değer karşılaştırmasıyla
doğrulandı; değer yazdırılmadan).

### Kod (anahtarı okuyan satırlar)

| Dosya:satır | Ne yapar |
|---|---|
| `src/server/sportmonks/cachedFetch.ts:268` | Tek gerçek upstream kapısı. Anahtarı okur, `Authorization: <anahtar>` başlığıyla gönderir (Bearer'sız). |
| `src/services/sportmonksRuntimeClient.ts:52` | Sunucu tarafında varlığını denetler ve `httpClient`'a geçirir; istek yine `cachedFetch` üzerinden gider. |
| `src/pages/api/sportmonks/[...path].ts:41` | Proxy: yalnız tanımlı mı diye bakar (yoksa 500). |
| `src/services/sportmonks/httpClient.ts` | Anahtarı env'den okumaz; verilirse `Authorization` başlığına koyar (tarayıcıda boş → başlık yok). |

Tarayıcı ve mobil uygulama anahtarı hiç görmez; ikisi de `/api/sportmonks/...` proxy'sine gider.

### Diğer yerler

- `scripts/load/simulate-visitors.mjs`, `scripts/load/redis-outage-bench.mjs`: gerçek anahtar kullanmaz
  (`SPORTMONKS_API_KEY: 'stub'`, sahte upstream).
- Testler (`*.test.ts`): sahte `test-token`.
- `.github/workflows/ci.yml`: Sportmonks anahtarı **yok** (build placeholder'larla alınır). CI'da değişiklik gerekmez.
- `vercel.json`: anahtar yok (yalnız cron yolu).
- `src/tweet-bot.js` (git dışı, yerel PM2 botu): Sportmonks kullanmaz.
- Belgeler (yalnız adı geçer, değer yok): `docs/SERVISLER_VE_PROD_CHECKLIST.md`, `docs/PROJE_ANALIZI.md`,
  `docs/GUNDEM_BOT_TASLAK.md`, `docs/SSR_VE_CACHE.md`, `docs/SPORTMONKS_MIGRATION.md`,
  `docs/SPORTMONKS_CANLI_DOGRULAMA_CHECKLIST.md`, `docs/API_FOOTBALL_MIGRATION.md`.
- Mobil repo `~/Desktop/projects/ofsaytyok-native`: anahtar **yok**. `src/api/client.ts` ve
  `src/services/sportmonks/httpClient.ts` yalnız web proxy'sine gider; `.env` / `.env.example`'da Sportmonks
  değişkeni yok. Mobilde değişiklik ya da yeni sürüm gerekmez.

### Vercel ortamları (koddan çıkarılan)

| Ortam | Gerekli mi | Gerekçe |
|---|---|---|
| Production | Evet | SSR, proxy, cron, gündem botu. |
| Preview | Evet (kullanılıyorsa) | Preview dağıtımları aynı kodu çalıştırır; Sentry de preview'da açık. |
| Development | Yalnız `vercel env pull` kullanılıyorsa | Yerel geliştirme `.env.local`'dan okur. |

### Yerel kopyalar (değer içeren, git dışı)

`SPORTMONKS_API_KEY` içeren `.env.local` dosyaları (2026-10-07):
`~/Desktop/projects/ofsayt-yok`, ve worktree'ler `ofsayt-yok-aibudget`, `-brand`, `-google`, `-lhmain`, `-sec-a`,
`-sec-b`, `-sec-c`, `-sec-d`, `-sentry`. Rotasyondan sonra ya güncellenmeli ya da worktree'lerle birlikte silinmeli.

## 2. Rotasyon adımları

Ön koşul: `security/a-sentry-scrub` (başlıkla kimlik + Sentry temizliği) **canlıda**. Önce yenilenirse yeni anahtar
eski kodla yeniden breadcrumb'a düşer.

1. **Yeni anahtar üret.** Sportmonks panelinde (my.sportmonks.com → API Tokens) yeni bir token oluştur. Eskisini
   henüz silme.
2. **Vercel env'lerini güncelle.** Proje → Settings → Environment Variables → `SPORTMONKS_API_KEY`:
   Production ve (kullanılıyorsa) Preview / Development için yeni değer. Değeri terminalde ya da sohbette paylaşma.
3. **Redeploy.** Production'ı yeniden dağıt (env değişikliği yalnız yeni dağıtımda geçerli). Kontrol:
   ana sayfa ve bir maç sayfası veriyle açılıyor; Vercel Logs'ta Sportmonks 401 yok; Sentry'de kota olayları
   (`reportSportmonksQuota`) gelmeye devam ediyor. Preview kullanılıyorsa onu da yeniden dağıt.
4. **Yerel `.env.local`'ları güncelle** (yukarıdaki liste) ya da kullanılmayan worktree'leri kaldır.
5. **Eski anahtarı iptal et.** Sportmonks panelinde eski token'ı sil. Ardından eski anahtarla bir istek 401
   dönmeli (değeri yazdırmadan, yalnız durum koduyla kontrol et).
6. **Sentry temizliği.**
   - Project Settings → Security & Privacy → **Advanced Data Scrubbing**: kural ekle,
     tür "Replace" / "Mask", eşleme *Regex* `api_token=[^&]+`, uygulama alanı `$string` (tüm metinler).
     Ek olarak Default Data Scrubbers ve "Scrub IP Addresses" açık olsun; Sensitive Fields'a `api_token`,
     `password`, `resetToken`, `newPassword`, `currentPassword` ekle.
   - Eski olaylar: Discover/Issues'ta `api_token` içeren breadcrumb'lı olayları bul (ör. kota uyarısı issue'ları,
     sunucu `captureError` olayları) ve issue'ları **Delete and discard** ile sil. Sentry geriye dönük scrub
     yapmaz; silmek tek yol.
7. **Kayıt.** Rotasyon tarihini ve kimin yaptığını (değer olmadan) bu belgeye ya da güvenlik raporuna not düş.
