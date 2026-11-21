# Mini Saha oyun sunucusu (Cloudflare)

Online 1v1 maçların hakemi: Cloudflare Worker + Durable Object (her oda bir nesne). Oyun mantığı sitedeki saf
modüllerde — `src/lib/miniSaha/room.ts` (oda akışı), `engine.ts` (fizik), `protocol.ts` (mesajlar); burası yalnız
WebSocket'leri odaya bağlar. Kalıcı depolama yok; oda boşalınca durur.

## Ücretsiz plan

Workers Free: günde 100.000 istek + 13.000 GB-sn. Tarayıcıdan gelen her 20 WebSocket mesajı 1 istek; sunucudan
gidenler sayılmaz. Girdi yalnız değişince gönderildiği için 3 dk'lık maç ≈ 275 istek → günde ≈ 350 maç. Kota dolarsa
bağlantı kurulamaz; site "Bota karşı oyna" gösterir. Sayaç her gün 00:00 UTC'de sıfırlanır.

## Yerel

```bash
npx --yes wrangler@4.166.0 dev --config oyun-sunucusu/wrangler.toml --port 8787 --ip 0.0.0.0 \
  --var IZINLI_KOKENLER:http://localhost:3000,http://192.168.1.6:3000
```

Site tarafında `.env.local`: `NEXT_PUBLIC_MINI_SAHA_SUNUCU=ws://192.168.1.6:8787` (telefon aynı Wi-Fi'de). Önizleme
yapılandırması: `.claude/launch.json` → `oyun-sunucusu`.

## Yayın

Canlı: `wss://oyun.getscor3.com` (ilk yayın 2026-11-21, kullanıcı onayıyla). Güncellemek için:

```bash
npx --yes wrangler@4.166.0 deploy --config oyun-sunucusu/wrangler.toml
```

Özel alan adı `wrangler.toml` `routes` satırında (DNS kaydı + sertifika Cloudflare'da otomatik). Sitenin online modu
için Vercel ortam değişkeni: `NEXT_PUBLIC_MINI_SAHA_SUNUCU=wss://oyun.getscor3.com` (tanımsızsa online mod gizli).
Sağlık: `https://oyun.getscor3.com/saglik` → `ok`.

İzinli kökenler (`IZINLI_KOKENLER`) yalnız getscor3.com; başka sitelerden bağlantı 403.
