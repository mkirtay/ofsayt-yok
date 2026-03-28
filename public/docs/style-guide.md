# Ofsayt Yok Style Guide (MVP)

## Overview

Bu rehber, modern ve spor odakli bir yesil tema ile MVP ekranlarinda tutarli bir gorunur kimlik saglar. Kurallar; renk, tipografi, bosluk, buton, kart, tablo, navigasyon ve responsive davranislarini kapsar. Uygulamada temel icerik genisligi `1040px`, mac detay kolon duzeni `735px + 300px` olarak korunur.

## Color Palette

### Design Rationale

Ana hedef, canli skor urunlerinde beklenen "hizli okunurluk + aksiyon vurgu" dengesidir. Bu nedenle arka planlar yumusak yesil-gri, aksiyonlar doygun yesil, metinler koyu-naturaldir. Durum renkleri (canli, hata, uyari) sadece geri bildirimde kullanilir; dekoratif amacla yayilmaz.

### Style Guide Specification

- **Brand Primary:** `#18A34A` (ana CTA, aktif nav, secili filtre)
- **Brand Dark:** `#0D7A3A` (hover/pressed)
- **Surface:** `#FFFFFF` (kartlar, tablo satirlari)
- **App Background:** `#F4F7F4` (sayfa zemini)
- **Muted Surface:** `#EDF3EE` (ikincil bloklar)
- **Text Primary:** `#102015`
- **Text Secondary:** `#4B5F52`
- **Border Soft:** `#D8E4DA`
- **Info/Live:** `#0EA5E9`
- **Warning:** `#F59E0B`
- **Danger:** `#DC2626`

JSON token ozet:

`{"color":{"primary":"#18A34A","primaryDark":"#0D7A3A","bg":"#F4F7F4","surface":"#FFFFFF","muted":"#EDF3EE","text":"#102015","textSecondary":"#4B5F52","border":"#D8E4DA"}}`

## Typography

### Design Rationale

Skor urunlerinde metin yogunlugu yuksektir; bu nedenle sade, yuksek okunurlu sans-serif secilir. Basliklar karar/odak noktalarini belirler, tablo ve olay satirlari daha kompakt tipografiye sahiptir.

### Style Guide Specification

- **Font family:** `"Inter", Arial, Helvetica, sans-serif`
- **H1:** `28px / 34px`, `700`
- **H2:** `22px / 28px`, `700`
- **H3:** `18px / 24px`, `600`
- **Body:** `14px / 21px`, `400`
- **Caption:** `12px / 18px`, `500`
- **Numeric score emphasis:** `20px / 24px`, `700`, tabular nums onerilir

## Spacing, Radius, Shadow

### Design Rationale

Komponentler arasi ritmi korumak icin 4 tabanli olcek tercih edilir. Kartlar ve filtrelerde yumusak radius ile modern gorunum korunurken tablo satirlari fazla yuvarlatilmaz.

### Style Guide Specification

- **Spacing scale:** `4, 8, 12, 16, 20, 24, 32`
- **Radius:** `8 / 12 / 16 / 999`
- **Shadow surface:** `0 10px 30px rgba(16, 32, 21, 0.08)`
- **Container:** `max-width: 1040px; margin: 0 auto;`

## Buttons

### Design Rationale

Filtre, gorunum secici ve birincil aksiyonlarin ayrismasi gerekir. Primary buton aksiyon odakli, ghost varyant ise toolbar/segmented control davranisina uygun olmalidir.

### Style Guide Specification

- **Primary:** yesil dolgu, beyaz metin, hover'da koyu yesil
- **Ghost:** beyaz veya transparan zemin, secili durumda acik yesil arka plan + koyu yesil metin
- **Height:** `36px` (toolbar), `40px` (form CTA)

Ornek:

`button.btn-primary { background:#18A34A; color:#fff; border:1px solid #18A34A; border-radius:999px; padding:0 16px; }`

## Cards and Tables

### Design Rationale

Mac listesi ve lig gruplari, kullanicinin hizla tarama davranisina gore optimize edilmelidir. Tablo satirlari kompakt olmali (`22-24px` ritmi), onemli satirlar renk ve kalinlikla vurgulanmalidir.

### Style Guide Specification

- **Card:** beyaz zemin, yumusak border, hafif shadow
- **League header:** uppercase, 12px, muted zemin
- **Table row height:** `22-24px`
- **Table divider:** `1px solid #D8E4DA`
- **Highlighted team row:** acik yesil ton (`#DFF5E6`)

Ornek:

`table.standings tr { height:24px; border-bottom:1px solid #D8E4DA; } table.standings tr.is-highlight { background:#DFF5E6; }`

## Navigation, Icons, and Imagery

### Design Rationale

Header ve yan navigasyon, canli urunlerde hizli gecis saglar. Ikonografi satir metninden rol calmaz; sadece durum destekler. Takim logolari ve oyuncu gorselleri etrafinda tarafsiz cerceve kullanilir.

### Style Guide Specification

- **Top/side nav active state:** primary text + 2px vurgu
- **Icon size:** `16px` (satir), `20px` (header)
- **Logo container:** beyaz veya acik gri zemin, `8px` radius
- **Image style:** asiri saturation/artifical glow kullanma

## Responsive Rules

### Design Rationale

MVP'de once desktop odakli duzen kurulur, ardindan tablet/mobilde bloklar tek kolona indirilir. Veri yogun ekranlarda once okunurluk, sonra estetik gelir.

### Style Guide Specification

- `> 1200px`: container merkezli, maksimum `1040px`
- `768px - 1199px`: yatay bosluklar azalir, ikili kolonlar korunur
- `< 768px`: tek kolon, tablo overflow-x destekli
- Sticky header mobilde daha ince paddingle kullanilir

Tam sayfa layoutlari ve ileri bilesenler icin bu token ve olcekler genisletilerek ayni prensip korunur.
