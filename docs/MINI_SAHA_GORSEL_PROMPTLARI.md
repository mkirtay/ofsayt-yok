# Mini Saha — karakter portreleri için ChatGPT prompt'ları

Portreler yalnız **karakter seçme ekranında** kullanılır (sahada oyuncular kodla çizilir; oradaki saç, bant, ibik gibi
ayrıntılar bu portrelerle aynı olsun diye aşağıdaki tarifler oyundaki simgelerle birebir eşleşir).

## Nasıl üretilir

1. ChatGPT'de **tek bir sohbet** aç; beş karakteri aynı sohbette sırayla üret (stil tutarlı kalsın).
2. Önce **Ana prompt + Dengeli** satırını gönder. Beğenince diğerleri için yalnız "Aynı stil, aynı çerçeve, aynı ışık;
   sadece karakter şu:" diye başlayıp ilgili karakter satırını yapıştır.
3. Beğenmediğin ayrıntıyı tek cümleyle düzelttir ("saç bandı beyaz olsun, yüz aynı kalsın").
4. İndir: PNG, **şeffaf arka plan**, kare. Dosya adları:
   `public/mini-saha/karakter-dengeli.png`, `-ruzgar`, `-bomba`, `-sihirbaz`, `-duvar`.
   Dosyaları bana ver ya da o klasöre koy; WebP'ye çevirip boyutlarını küçültürüm.

## Ana prompt (her seferinde ilk mesajda)

```
Mobil futbol oyunu için karakter portresi. Stil: yarı-düz (semi-flat) dijital illüstrasyon, temiz kalın konturlar,
yumuşak gölgelendirme, hafif çizgi film oranları (kafa biraz büyük), canlı ama doygunluğu dengeli renkler.
Çerçeve: göğüs hizasından yukarısı (bust), yüz hafif sağa dönük 3/4 açı, karakter kareyi ortalı doldursun,
başın üstünde biraz boşluk kalsın.
Kıyafet: düz camgöbeği (#06D0F9) futbol forması, V yaka, göğüste sadece büyük beyaz forma numarası.
HİÇBİR logo, marka, kulüp arması, sponsor, yazı veya bayrak olmasın.
Işık: soldan yumuşak ana ışık, sağ kenarda ince yeşil (#00A76F) kontur ışığı.
Arka plan: tamamen şeffaf (PNG). Gölge veya zemin çizgisi yok.
Karakter tamamen hayali olsun; gerçek bir futbolcuya, ünlüye veya tanınmış bir kişiye BENZEMESİN.
1024×1024.
```

## Karakter satırları

**Dengeli — 8 numara**
```
Karakter: "Dengeli", 8 numara. 25 yaşlarında, orta yapılı, sakin ve kendinden emin ifade, hafif gülümseme.
Kısa, düzgün kesilmiş koyu kahverengi saç. Buğday tenli. Aksesuar yok.
```

**Rüzgâr — 7 numara**
```
Karakter: "Rüzgâr", 7 numara. 21 yaşlarında, ince ve atletik, enerjik ve hafif muzip ifade, sanki koşuya başlamak üzere.
Siyah kıvırcık saç, alnında BEYAZ kalın saç bandı. Koyu ten. Yanaklarda hafif hareket hissi veren rüzgâr çizgileri
(arka planda değil, karakterin hemen yanında, çok ince).
```

**Bomba — 9 numara**
```
Karakter: "Bomba", 9 numara. 27 yaşlarında, güçlü omuzlar, kararlı ve sert bakış, çene hafif yukarıda.
Yanları kazınmış, ortada kısa SARI-TURUNCU ibik (mohawk) saç. Açık buğday ten. Kaşta küçük bir yara izi.
```

**Sihirbaz — 10 numara**
```
Karakter: "Sihirbaz", 10 numara. 24 yaşlarında, narin yapılı, zeki ve rahat ifade, yarım gülümseme, göz kırpmıyor.
Omuza kadar dalgalı SİYAH saç, ensede atkuyruğu. Esmer ten. Sol bilekte MOR ince bileklik görünsün.
```

**Duvar — 4 numara**
```
Karakter: "Duvar", 4 numara. 30 yaşlarında, çok iri ve geniş omuzlu, ciddi ve koruyucu ifade.
Çok kısa (sıfıra yakın) saç, dolgun kısa sakal. Açık ten, hafif kızarık yanaklar. Sol kolda SARI kaptan pazubendi
(üzerinde yazı yok, sadece düz bant).
```

## Sahadaki simgelerle eşleşme (kodda)

| Karakter | Sahada görünen ayrıntı |
|---|---|
| Dengeli | kısa kahverengi saç |
| Rüzgâr | siyah saç + beyaz saç bandı |
| Bomba | sarı-turuncu ibik |
| Sihirbaz | siyah atkuyruğu + mor bileklik |
| Duvar | çok kısa saç + sakal, daha iri gövde, sarı pazubent |

Portrelerde bu renkleri değiştirirsen haber ver; sahadaki simgeyi de aynı renge çekerim.
