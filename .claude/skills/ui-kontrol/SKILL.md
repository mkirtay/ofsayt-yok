---
name: ui-kontrol
description: Scor3 (getscor3.com) arayüzüne dokunan HER işte kullan — yeni bileşen, modal/diyalog/panel/tam sayfa görünüm, kart, liste, yerleşim, SCSS, responsive, tema. Kod yazmadan önce kuralları oku, bitirince görsel kontrol listesini uygula ve ekran görüntüsüyle doğrula. Kullanıcı "UI kötü", "çirkin", "düzelt", "iyileştir", "tasarım" dediğinde de yükle.
---

# UI kontrol — Scor3

Amaç: "çalışıyor" değil, **iyi görünüyor** ve projedeki diğer ekranlarla aynı dili konuşuyor. Bir UI işi ancak
aşağıdaki kontrol listesi geçip ekran görüntüsüyle gösterildiğinde bitmiştir.

## 1. Kod yazmadan önce

1. **Benzerini bul ve onu örnek al.** Aynı türde bir bileşen zaten var mı? (`grep -rl 'role="dialog"' src/components`)
   - Modal / diyalog: `src/components/ConfirmDialog` (overlay + ortalı kutu, mobilde alttan sheet, odak tuzağı, Esc, portal).
   - Lig seçici diyaloğu: `src/components/HubLeaguePicker`.
   - Yan panel: `src/components/MatchDetailPanel` (`.panel` → `.scroll` modeli).
2. **Tokenları kullan** (`src/styles/_tokens.scss`, `_variables.scss`, karar kaydı `docs/DESIGN_SYSTEM.md`):
   - Boşluk yalnız 4/8/12/16/24/32/48 (`$spacing-*` / `--space-*`). Kart iç padding 16, kompakt 12.
   - Renk: yalnız CSS değişkeni. Ham `#hex` / `rgba()` yazma — `designTokens.test.ts` sayıyı sayar, artarsa kırılır.
     Yeni renk gerekiyorsa `_tokens.scss`'e anlamlı adla ekle.
   - Yarıçap `$radius-sm/md/lg/full`, gölge `$shadow-surface`, geçiş `$transition-base`.
   - Tipografi merdiveni: bölüm başlığı 15–16/600, gövde 14, meta 13 ikincil gri, etiket 11. Büyük sayı vurgusu kartın
     ana bilgisiyse olur, her yerde değil.
   - Dokunma hedefi ≥ 40 px (ikon düğmesi dahil, en az 32 px görünür + yeterli alan).
3. **Tek aksiyon rengi yeşil:** aktif sekme/pill, birincil CTA, canlı nokta. Büyük yeşil zeminli kutular yapma.

## 2. Modal / tam sayfa görünüm kuralları (en sık bozulan yer)

- **Portal** ile `document.querySelector('[data-app-root]') ?? document.body` içine çiz (ConfirmDialog gibi). Inter fontu
  `data-app-root`'ta tanımlı; düz `document.body`'ye açılan diyalog Times ile çizilir. Kartın kendisini `position: fixed`
  yapıp büyütme.
- Kutu **içeriğe göre** boyutlanır: `width: min(<içeriğe uygun>px, 100%)`, `max-height: calc(100dvh - 48px)`,
  yükseklik `auto`. Sabit `inset` ile ekranı doldurup altını boş bırakma.
- Büyük görünüm **alanı kullanmalı**: dar sütundaki içeriği yalnız genişletmek yetmez. Sekmelerle tek tek gösterilen
  şeyler geniş ekranda yan yana sütunlara/ızgaraya açılır (karşılaştırma). Satırlar 640–720 px'ten uzun olmasın; uzun
  satırda sol metin ile sağ rozet arasında dev boşluk kalıyorsa düzen yanlıştır.
- Başlık çubuğu: ikon + başlık + sağda açık bir **Kapat (X)** düğmesi; içerik başlığın altında kendi içinde kayar.
- Esc, arka plana tıklama, X kapatır; açılınca odak diyaloğa gider, kapanınca eski elemana döner; Tab tuzağı.
- **Scroll kilidi yalnız `lockBodyScroll()`** (`src/utils/scrollLock.ts`). `document.body.style.overflow` YAZMA —
  sticky header kayar (2026-11-20 hatası).
- Overlay `z-index` mevcut diyaloglarla uyumlu (LeaguePicker 1000, ConfirmDialog 1100); site header'ın üstünde kalmalı.
- Mobilde (`@include below-desktop`) alttan sheet: tam genişlik, üst köşeler yuvarlak, `--safe-bottom` padding.
- Açılırken kısa giriş (opacity + hafif translate/scale, ≤ 180 ms) ve `prefers-reduced-motion`'da kapalı.

## 3. Yerleşim kuralları

- Sütunlu sayfalarda (ana sayfa hub'ı `src/pages/index.module.scss`) tek yükseklik kaynağı `$hub-fill-height`;
  sütunlar kendi içinde kayar. Bir sütun sayfayı kaydırıp diğerlerini yerinde bırakmasın.
  Yerleşim kuralları `src/styles/hubLayout.test.ts` ile korunur — bilerek değiştiriyorsan testi de güncelle.
- Boş durum: `EmptyState` dili — 13 px ikincil gri bilgi notu, hata gibi değil.
- Metin taşması: isimler `text-overflow: ellipsis` veya iki satır; rozetler sıkışmasın (`flex: 0 0 auto`).

## 4. Bitirince — görsel kontrol listesi (atlanmaz)

Ekran görüntüsü al (yerel dev sunucu, `.claude/launch.json`) ve şunlara tek tek bak:

- [ ] Masaüstü 1440 ve 1280, mobil 375 — üçü de.
- [ ] Koyu VE açık tema.
- [ ] Gereksiz boş alan yok (kutunun yarısı boş, satırın ortası boş vb.).
- [ ] Hizalar tutarlı: sol kenarlar aynı çizgide, aynı türdeki öğeler aynı boyutta.
- [ ] Hiyerarşi: göz önce asıl bilgiye gidiyor; her şey aynı ağırlıkta değil, her şey de bağırmıyor.
- [ ] Kontrast ≥ 4.5:1 metin, ≥ 3:1 ikon/kenarlık.
- [ ] Etkileşim: hover/focus görünür, Esc/kapat çalışıyor, mobilde dokunma hedefi yeterli.
- [ ] Projedeki benzer ekranla yan yana koyunca aynı ailedenmiş gibi duruyor.

Görüntüye **eleştirmen gözüyle** bak: "kullanıcı bunu görse 'kötü görünüyor' der mi?" Diyecekse bitmemiştir — düzelt,
tekrar çek. Kullanıcıya sonucu ekran görüntüsüyle göster.

**Yalnız giriş/admin ile görünen ekranlar** (ör. kombine kartı yalnız admin): sahte oturum/JWT üretme. Bileşeni
sahte veriyle çizen geçici bir önizleme sayfası ya da render testi üzerinden doğrula; o da mümkün değilse görmediğini
açıkça söyle. Önizleme sayfası:
- `src/pages/onizleme-<ad>.tsx` (commit'lenmez, iş bitince sil). Bileşeni `next/dynamic` + `ssr: false` ile yükle;
  API çağrılarını sayfanın başında `window.fetch`'i sarıp sahte JSON döndürerek karşıla.
- Kendi `.claude/launch.json` girdinle ayrı port + `NEXT_DIST_DIR` kullan (paralel oturumlarla çakışmasın); iş bitince
  girdiyi ve dist klasörünü sil.
- Tarayıcı paneli gizliyken ekran görüntüsü eski/yarım animasyonlu gelebilir: şüpheli görüntüyü bir kez daha çek.

## 5. Kod tarafı

- Değişen bileşenin render testi ve `scssCompile` testi geçmeli; `npx tsc --noEmit`.
- Testleri `npx vitest run --dir src <yol>` ile çalıştır (yoksa `.claude/worktrees/*` kopyaları da koşar).
- Lighthouse yalnız sayfa yüküne dokunan değişikliklerde (CLAUDE.md).
