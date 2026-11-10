# Milli maçlar (API-Football) — durum ve çalıştırma

Dal: `claude/national-matches-af-1a48cb` (PUSH EDİLMEDİ). Bayrak varsayılan KAPALI; kapalıyken site birebir eskisi gibi çalışır
(milli maç grubu yok, AF'ye istek yok, `/api/national/*` ve 2e9 üstü maç/takım adresleri 404).

## Yerelde çalıştırma
`.env.local`'a: `API_FOOTBALL_KEY=...` (Pro) ve `NATIONAL_MATCHES_ENABLED=1`; `npm run dev`.
- Ana sayfa: tarih şeridinde milli maç olan güne git (ör. 14 Kasım) → milli turnuva grupları listenin en üstünde.
- Maç: `/matches/2001528905` · Takım: `/teams/2000000777` · Puan durumu maç sayfasının sağ sütununda.

## Kimlik
Uygulama id'si = AF id + 2_000_000_000 (maç, takım, lig, oyuncu). `src/services/apiFootball/ids.ts`. Migration yok; favori
`Int[]` alanları int4'e sığar (API üst sınır kontrolü eklendi).

## Akış
Tarayıcı yalnız kendi uçlarımıza gider: `/api/matches/day` (liste; milli maçlar `loadHomeDay` içinde birleşir),
`/api/national/matches|standings|teams/[id]`, `/api/matches/[id]/live` (2e9 dalı), `/api/og/match/[id]`.
Sunucu: `src/server/apiFootball/*` (SWR/Redis önbellek; günlük iç bütçe 5000/7500). Liste = günde tek `fixtures?date=` isteği
(turnuva beyaz listesi `src/config/nationalLeagues.ts`, genç/kadın takımlar elenir), canlı skor aynı listeden.

## Bilerek yok
Anlatım / AI Analiz / Trivia, baskı şeridi, hakem puanı, H2H/form, sezon seçici, takım sayfasında sezon özeti/transfer/sakatlık;
forma rengi, xG, hava, TV. Sitemap'e eklenmedi. Milli takım adları Türkçe sabit (EN arayüzde de).

## Sonraki
Liste hata durumunu kullanıcıya göstermek (şimdi AF hatasında milli maçlar sessizce yok), sitemap, takım OG görseli, AI analiz bağlamı.
