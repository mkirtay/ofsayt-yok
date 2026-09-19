# Ofsayt Yok — Web + Mobil Denetim Raporu (Temmuz 2026)

> Kapsam: `ofsayt-yok` (web, Next.js) ve `ofsaytyok-native` (mobil, Expo).
> Bu rapor salt-okunur incelemeyle hazırlandı; hiçbir kod değişikliği yapılmadı.
>
> **Not:** Referans Figma ekran görüntüleri (List / List v2 / Detail) mesaja ekli
> gelmediği için Faz 2'deki "tasarıma yakınlık" değerlendirmesi, kodun kendi
> token/tutarlılık analizi üzerinden yapıldı. Görseller paylaşıldığında bu bölüm
> ekran-ekran kıyasla derinleştirilebilir.

---

## 1. Özet — En Kritik Bulgular

1. **[KRİTİK — mobile] Mobil uygulama, web backend'inden bu hafta kaldırılan premium/Stripe modeline hâlâ tam bağımlı.** `usePremium`, `PremiumGate`, `app/premium.tsx`, `createCheckout` (silinmiş `/api/payment/create-checkout` endpoint'ine POST atıyor → 404), `AuthUser.premiumUntil/isPremium` (backend artık `credits` dönüyor). AI Analiz/Trivia kilit ekranları çalışmayan bir satın alma akışına yönlendiriyor. Mobil şu an **yayınlanabilir durumda değil**.
2. **[KRİTİK — mobile] AI analiz akışı mobilde eski sözleşmeyle çalışıyor.** Web'de analiz artık "GET = sadece görüntüle, POST = 5 kredi ile üret" modeline geçti; mobil hâlâ tek GET atıyor — analiz yoksa 404 alır, üretme imkânı yok. Kredi bakiyesi/satın alma kavramı mobilde hiç yok.
3. **[YÜKSEK — ikisi] İki repo tamamen bağımsız; 8+ çekirdek mantık dosyası kopyala-yapıştır ve çoktan sapmış durumda.** `liveScoreService.ts` (891 vs 1031 satır), `leagues.ts` (web'e bu hafta eklenen World Cup tier-0 önceliği mobilde yok), `worldCupBracket.ts`, `matchUrl.ts`, `models/liveScore.ts` vb. Her düzeltme iki kez yapılmak zorunda ve pratikte yapılmıyor (kanıt: World Cup fikstür düzeltmeleri sadece web'de).
4. **[YÜKSEK — web] 7 ölü bağımlılık `package.json`'da duruyor:** `stripe`, `@stripe/stripe-js`, `micro` (premium kaldırılınca öksüz kaldı), `@reduxjs/toolkit`, `react-redux` (hiç import edilmiyor — state react-query/zustand'a geçmiş), `next-i18next`, `i18next`, `react-i18next` (özel `src/lib/i18n.tsx` kullanılıyor). Bundle'a girmeseler de kurulum/CI süresini ve `npm audit` yüzeyini şişiriyorlar.
5. **[ORTA — ikisi] Tema token'ları iki platformda birbirinden bağımsız tanımlı ve renkler uyuşmuyor:** koyu yeşil web'de `#007B55`, mobilde `#00845a`; metin rengi web `#102015`, mobil `#111827`; canlı-maç kırmızısı web `#ef4444`, mobil `#e11d48`. Mobilde dark mode var, web'de yok. Marka tek ama iki ayrı görsel dil oluşuyor.
6. **[ORTA — web] Lint backlog'u CI'da `continue-on-error` ile susturulmuş** (~33 hata: `no-explicit-any` ×12, React 19 derleyici kuralları ×~18). Mobilde ise lint temiz.
7. **[ORTA — web] Test kapsamı çok dar:** 3 dosya / 31 test, tamamı util seviyesinde (`matchUrl`, `security`, `validation`). Kredi sistemi, analiz API'si, tahmin değerlendirme gibi para/iş mantığı testsiz. Mobilde hiç test yok.
8. **[ORTA — mobile] Erişilebilirlik neredeyse hiç yok:** tüm uygulamada 9 adet `accessibility*` prop'u (çoğu StateViews/PressableScale içinde). Web görece iyi (51 aria kullanımı + `:focus-visible` global kuralı).
9. **[DÜŞÜK — web] Görsel disiplin karışık:** 13 dosyada ham `<img>`, 7'sinde `next/image`. Takım logoları zaten `unoptimized`/proxy'li olduğu için pratik etki sınırlı ama tutarsız.
10. **[İYİ HABER]** Mobil kod tabanı genç (3 commit) ama mimarisi sağlam: FlashList (virtualization + `getItemType`), app-aktif-farkında polling'li react-query, expo-image cache, temiz `StateViews` (loading/error/empty), light/dark tema, i18n. İskeleti doğru; sorunu güncelliğinin web'in gerisinde kalması.

---

## 2. Proje Envanteri (Faz 1)

| | **Web (`ofsayt-yok`)** | **Mobil (`ofsaytyok-native`)** |
|---|---|---|
| Framework | Next.js 16 (Pages Router), React 19 | Expo 56, RN 0.85, expo-router, React 19 |
| State | TanStack Query 5 + local state | TanStack Query 5 + Zustand (auth) |
| Styling | SCSS Modules + `_variables.scss` token'ları | `StyleSheet` + `src/theme` token'ları (light/dark) |
| Veri katmanı | `/api/livescore` proxy (Redis+memory cache), Prisma/PostgreSQL | Web'in proxy'sine axios; Bearer token (SecureStore) |
| i18n | Özel `src/lib/i18n.tsx` (TR/EN JSON) | i18next + react-i18next (TR/EN) |
| Build/CI | Vercel + GitHub Actions (lint/test/build, cron) | EAS Build (iOS profilleri hazır) |
| Test | Vitest — 3 dosya, 31 test | Yok |
| Paylaşılan kod | **Yok** — monorepo/paket yok; 8+ dosya kopyalanmış ve sapmış | (aynı) |

**Ekran eşlemesi:**

| Ekran | Web | Mobil | Not |
|---|---|---|---|
| Ana sayfa (maç listesi) | `/` | `(tabs)/index` | Tasarım dili yakın; mobil World Cup önceliği/fikstür düzeltmelerini almadı |
| UEFA / World Cup hub | `/uefa`, `/world-cup` | `(tabs)/uefa`, `(tabs)/world-cup` | Mobil WC ekranı sabit koyu tema (web ile uyumlu) |
| Puan durumu | `/standings` | `(tabs)/standings` | — |
| Maç detay | `/matches/[slug]` | `match/[slug]` | Mobilde analiz/trivia PremiumGate'e takılı (bozuk) |
| Takım | `/teams/[id]` | `team/[id]` | — |
| Haberler | (ana sayfa sidebar) | `news/list`, `news/[id]` | Mobilde ayrı ekran — web'de detay `/news/[id]` var |
| Karşılaştırma | `/compare/[slug]` | `compare/[slug]` | — |
| AI istatistikleri | `/ai-istatistikleri` (artık herkese açık) | `ai-stats` (hâlâ premium-gated) | Sapmış |
| Premium / Krediler | ~~/premium~~ → `/credits` | `premium` (**bozuk**) | Mobilde kredi ekranı yok |
| Profil / Auth | `/profile`, `/auth/*` | `(tabs)/profile`, `auth/*` | Mobil forgot-password web endpoint'ini kullanıyor ✓ |
| Yasal (gizlilik/şartlar/iletişim) | Var (yeni) | Yok | App Store için gizlilik politikası linki gerekecek (web'e link yeterli) |

**Tasarım referansı durumu** (Figma görselleri gelmediği için token-tutarlılığı bazlı):
- *Tasarıma yakın:* Web ana sayfa/maç listesi, maç detay, credits; mobil hub ekranları, maç detay.
- *Sapmış:* mobil `premium`/`ai-stats` (eski ürün modeli), web ile mobil arasındaki renk sapmaları (aşağıda).
- *Tasarım referansı yok:* yasal sayfalar, iletişim, auth ekranları, compare, haber detay.

---

## 3. UI/UX Bulguları (Faz 2)

### Web
- **Token disiplini iyi durumda:** `_variables.scss` bu hafta genişletildi (durum rozetleri `$color-live/finished/upcoming`, koyu yüzey, condensed skor tipografisi) ve öncelikli bileşenler (Header, MatchCard, MatchList, MatchAnalysis, SubHeader, Credits) bunları kullanıyor. Ancak eski sayfalarda (profil, standings, compare, forum) hardcoded hex değerler sürüyor (örn. `matchCard.module.scss` içinde `#153d6b` header mavisi, `matchList` içinde `#FBFBFB/#ECECEC`).
- **Responsive:** `.layout-split` mobil sıralaması bu hafta düzeltildi (içerik önce, sidebar sonra). Kalan bilinen riskler: `MatchCard` H2H tablosu 520px min-width ile yatay scroll'a düşüyor (kabul edilebilir), `Lineup` yan listeleri `$bp-sm` altında gizleniyor (bilinçli). Sistematik dar-ekran taraması (375px) yapılmadı — aksiyon planında.
- **a11y:** 51 `aria-*` kullanımı + global `:focus-visible` halkası iyi bir taban. Eksikler: bazı ikon-butonlarda (`favori ☆`) `aria-label` var ama tablo bazlı içeriklerde başlık/scope eksik; kontrast genelde güçlü (yeşil üstü beyaz) fakat `$color-text-secondary (#4B5F52)` küçük punto ile sınırda.
- **Empty/loading:** `Skeleton` bileşen ailesi (MatchList/MatchCard/Lineup/TeamHeader) tutarlı kullanılıyor; AI analiz için özel animasyonlu yükleme (AiLoadingPitch) var. Hata durumları çoğunlukla metin + retry.

### Mobil
- **Token disiplini web'den daha iyi:** tüm renkler `ThemePalette` üzerinden, spacing/radius/fontSize ölçekleri tanımlı, hardcoded değer istisnası az (`#fff` buton metinleri). Light/dark + World Cup override temiz kurgulanmış.
- **Liste UX'i:** FlashList + `getItemType` + `useCallback` ile doğru kurulmuş. `DateStrip`, `SegmentedTabs`, `PanelSheet` gibi mobil-özel pattern'ler mevcut.
- **Empty/error/loading:** `StateViews` (LoadingView/ErrorView/EmptyView) merkezi ve her yerde kullanılıyor — web'deki skeleton yaklaşımından farklı (spinner bazlı); skeleton'a geçiş algılanan hızı artırır.
- **a11y: en zayıf alan.** 9 accessibility prop'u; dokunma hedefleri çoğunlukla yeterli (PressableScale padding'li) ama etiketsiz ikonlar, `accessibilityRole` eksikleri yaygın.
- **Bozuk akışlar:** `premium.tsx` satın alma → 404; `ai-stats` premium kilidi → web'de artık herkese açık olan içeriği mobilde kilitliyor; analiz ekranı analiz yoksa boş/404.

### Web ↔ Mobil Tutarsızlıkları
| Öğe | Web | Mobil |
|---|---|---|
| Koyu yeşil | `#007B55` | `#00845a` |
| Zemin | `#F4F7F4` (yeşilimsi) | `#f4f5f7` (gri) |
| Metin | `#102015` (yeşilimsi siyah) | `#111827` (gri-siyah) |
| Canlı kırmızısı | `#ef4444` | `#e11d48` |
| Radius ölçeği | 8/12/16 | 6/10/14/20 |
| Dark mode | Yok (sadece WC teması) | Var (sistem takipli) |
| Ürün modeli | Kredi (5 kredi/analiz) | Premium abonelik (kaldırılmış model) |
| AI istatistik erişimi | Herkese açık | Premium-kilitli |
| Maç listesi durum rozeti | Pulse'lu CANLI rozeti | Sade `live` renk vurgusu |

---

## 4. Performans Bulguları (Faz 3)

### Web
- **Güçlü:** SSR ağırlığı bilinçli kaldırılmış (client fetch + skeleton, commit `d405414`), maç listesi `react-window` ile virtualized, LiveScore proxy'sinde paylaşımlı Redis cache (upstream kota koruması), react-query `staleTime` disiplini var.
- **Riskler:**
  - `MatchCard` her maç için ayrı H2H isteği atıyor (`getTeamsHead2Head`) — detay sayfası başına ekstra istek; cache'li ama zincirleme render'ı geciktiriyor.
  - Ana sayfa "Hepsi" sekmesi `getAllMatchesByDate(date, 5)` ile 5 sayfa history + canlı + fikstür çekiyor; yoğun günlerde ilk yüklenme maliyetli (kısmen kaçınılmaz).
  - `2026_FIFA_World_Cup_Logo.png` 714KB — OG/paylaşım ve WC sayfasında kullanılıyor; sıkıştırılmalı (~50-100KB'a iner).
  - Ham `<img>` kullanılan 13 dosyada `loading="lazy"` çoğunlukla var ama boyut/`decoding` tutarsız.
- **Bundle:** ölü bağımlılıklar runtime bundle'a girmiyor (import yok) — Core Web Vitals'a doğrudan zarar tespit edilmedi; ölçüm için `next build` çıktısındaki route boyutları makul görünüyordu (bu oturumdaki build'lerde uyarı yoktu).

### Mobil
- **Güçlü:** FlashList virtualization, `getItemType` ile heterojen satır optimizasyonu, `refetchInterval`'in app-aktif durumuna bağlanması (arka planda polling durur — pil/veri dostu), `expo-image` ile disk cache, `staleTime` katmanlaması (canlı=0, statik=5dk, sezonlar=1saat).
- **Riskler:**
  - Canlı polling 30sn'de tüm hub sorgusunu (history+live+fixtures) yeniliyor; sadece `live` endpoint'ini yenileyip listeyi patch'lemek istek hacmini düşürür (web'deki `refreshHomeHubLiveFixtures` pattern'inin eşleniği mobilde yok).
  - `StandingsTable` yatay ScrollView — 20 satır için sorun değil, virtualization gerekmiyor (doğru karar).
  - Açılış: splash sonrası ilk hub isteği bekleniyor; `queryClient` persist (AsyncStorage) eklenirse soğuk açılışta son veriler anında gösterilebilir.

### API/Veri Katmanı (ortak)
- Mobil, web'in proxy'sini kullandığı için upstream kota koruması mobile de yansıyor ✓.
- Tekrarlı istek riski: mobil hub sorguları `staleTime: 0` ile her odakta yeniden çekiyor; `PLACEHOLDER`/önceki veri gösterimi var mı ekran ekran doğrulanmalı.

---

## 5. Kod Kalitesi Bulguları (Faz 4)

- **Component tekrarı (web-içi):** `MatchHubPage` (/, /uefa) ile `world-cup/index.tsx` aynı sidebar/layout pattern'ini bağımsız kuruyor (bilinen, bilinçli ama birleştirilebilir). `MatchAnalysis` ve `MatchTrivia` neredeyse aynı fetch/durum iskeletine sahip.
- **Cross-repo tekrar:** yukarıda (Özet #3). En riskli ikili: `liveScoreService.ts` ve `leagues.ts` — davranış farkları kullanıcıya görünür (sıralama, WC fikstürleri).
- **Ölü kod/bağımlılık (web):** Özet #4'teki 7 paket + `next-i18next.config.js` (paket importsuz). `react-datepicker` tek dosyada — gerçekten gerekli mi bakılmalı.
- **Ölü kod (mobil):** premium akışı ürün kararıyla ölü (silinmedi, bozuk); onun dışında temiz.
- **İsimlendirme/dil:** her iki repo da TR yorum + EN tanımlayıcı düzeninde tutarlı.
- **Lint:** web'de 33 hatalık backlog CI'da susturulmuş (`continue-on-error`); mobil temiz. Web backlog'unun ~18'i React 19'un yeni `set-state-in-effect`/purity kuralları — mekanik ama dikkat isteyen refactor.
- **Test:** web 31 test (util-only); kritik yollar (kredi düşme transaction'ı, analiz cache/üretim, tahmin değerlendirme, middleware cron bypass) testsiz. Mobil 0 test.
- **Güvenlik notu:** `npm audit` web'de 40 zafiyet raporluyor (2 low/19 moderate/19 high) — çoğu dev-bağımlılığı; ölü paket temizliği sonrası yeniden ölçülmeli.

---

## 6. Öncelikli Aksiyon Planı (Etki × Efor)

> Sıralama: önce yüksek etki + düşük/orta efor. Her madde hangi projeyi ilgilendirdiğiyle etiketli.

| # | Aksiyon | Proje | Etki | Efor |
|---|---|---|---|---|
| 1 | **Mobili kredi modeline geçir:** `AuthUser`'a `credits`, `usePremium`→`useCredits`, PremiumGate yerine "AI ile Analiz Et (5 kredi)" + POST akışı, `premium.tsx`→`credits` ekranı (satın alma "yakında"), `ai-stats` kilidini kaldır, ölü `createCheckout`'u sil | mobile | **Yüksek** | Orta |
| 2 | **Mobil WC/sıralama paritesi:** web'e bu hafta giren düzeltmeleri taşı — WC tier-0 önceliği (`leagues.ts`), WC fikstür kaynağı (`getFixturesByCompetition` birleşimi), maçlar sekmesinde planlanmış maçlar | mobile | **Yüksek** | Düşük |
| 3 | **Ölü bağımlılık temizliği:** 7 paket + `next-i18next.config.js`; ardından `npm audit` yeniden ölç | web | Orta | **Düşük** |
| 4 | **Marka token'larını tek kaynağa bağla:** önce basit senkron (mobil renkleri web değerlerine eşitle: koyu yeşil `#007B55`, canlı `#ef4444` vb.), orta vadede JSON token dosyası → SCSS + TS üretimi | ikisi | Orta | Düşük (senkron) / Orta (üretim) |
| 5 | **Paylaşılan mantık stratejisi kararı:** ya (a) npm workspace/monorepo ile `shared` paket (`models`, `matchUrl`, `matchForm`, `leagues`, `worldCupBracket`), ya (b) "web kaynak-of-truth + kopyalama checklist'i". (a) kalıcı çözüm; migration eforu yüksek | ikisi | **Yüksek** | Yüksek |
| 6 | **Kritik yol testleri:** `spendCredits` transaction'ı, analiz POST (cache→kredi→üretim), `evaluatePendingPredictionRecords`, middleware cron bypass | web | Orta | Orta |
| 7 | **Mobil a11y geçişi:** liste satırları/butonlara `accessibilityRole`+`Label`, dinamik font ölçeği kontrolü | mobile | Orta | Orta |
| 8 | **Web lint backlog'unu erit:** `no-explicit-any` (12) mekanik; React 19 kuralları (18) dikkatli refactor; sonra CI'daki `continue-on-error`'ı kaldır | web | Orta | Orta |
| 9 | **Mobil canlı polling'i inceltme:** 30sn'de tam hub yerine yalnız `matches/live` yenile + cache patch | mobile | Orta | Orta |
| 10 | **WC logosunu sıkıştır (714KB→<100KB)** + ham `<img>` kullanımlarını gözden geçir | web | Düşük | Düşük |
| 11 | Mobilde skeleton loading (StateViews'a alternatif) + react-query persist ile soğuk açılış verisi | mobile | Düşük | Orta |
| 12 | 375px sistematik dar-ekran taraması (tüm web sayfaları) + eski sayfalardaki hardcoded hex'leri token'a çevirme | web | Düşük | Orta |
| 13 | Figma referans ekranları paylaşılınca ekran-ekran tasarım kıyası (bu raporun eksik bölümü) | ikisi | Orta | Düşük |

**Önerilen ilk sprint:** #1 + #2 (mobil ürünle yeniden hizalanır, yayınlanabilir hale gelir) + #3 (yarım saatlik temizlik). #5 kararını bu sprint sonunda vermek mantıklı — #1/#2'yi yaparken kopya dosyalara üçüncü kez dokunacağınız için monorepo ihtiyacını somut hissedeceksiniz.
