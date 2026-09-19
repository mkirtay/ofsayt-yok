# Sportmonks — Canlı Maç Uçtan Uca Doğrulama Checklist'i

**Bu belge bir kod görevi değildir — Claude Code tarafından OTOMATİKLEŞTİRİLEMEZ.**
docs/SPORTMONKS_MIGRATION_PLAN.md "Faz 4 — Doğrulama" bölümünün son maddesi: *"Canlı bir
maçla uçtan uca bir manuel doğrulama: dakika göstergesinin gerçekten ilerlediği, skorun
güncellendiği, state geçişlerinin (NS→1st→HT→2nd→FT) doğru yakalandığı."* Bu, gerçek
zamanlı bir olayı (canlı oynanan bir maç) gerektiriyor — bir test fixture'ıyla veya mock
zamanla simüle edilemez, o yüzden bu checklist **elle, gerçek bir maç sırasında** çalıştırılmalı.

Faz 1-4'te yazılan tüm parser/mapper fonksiyonları (`stateMapping.ts`, `minuteDerivation.ts`,
`scoreDerivation.ts`) gerçek ama **statik** fixture'lara (tek bir zaman noktasının donmuş
görüntüsü) karşı test edildi — bunların "gerçekten zamanla doğru ilerlediğini" hiçbir
otomatik test kanıtlayamaz, çünkü bunun için zamanın gerçekten akması gerekiyor.

---

## Ön koşullar

1. `.env.local`'da `SPORTMONKS_API_KEY` dolu olmalı (zaten var).
2. `NEXT_PUBLIC_SPORTMONKS_ENABLED=true` set edilmeli (yoksa site eski livescore-api.com
   sağlayıcısını kullanır, bu checklist anlamsız kalır).
3. Dev server ayakta: `npm run dev`.
4. Gerçekten canlı oynanan bir maç bulunmalı — ana sayfadaki "Canlı" sekmesi ya da
   doğrudan `GET /api/sportmonks/football/livescores/inplay?include=participants;state`
   ile kontrol edilebilir (tarayıcıdan veya `curl` ile — bu adım salt-okunur, kota
   düşürmez... aslında bir Fixture isteği olduğu için kota düşürür, gereksiz sık
   çağırma). Sportmonks Growth planı ile hangi liglere erişim olduğunu unutma (Faz 1-3
   raporlarında listelenen ligler — Süper Lig, Büyük 5, UEFA üçlüsü).
5. Tercihen düşük profilli bir maç seç (örn. Süper Lig veya 1. Lig) — büyük bir maçta
   yoğun trafik nedeniyle kendi kota kullanımını (Fixture havuzu, saatlik ~2500 istek)
   gereksiz tüketmemek için.

---

## 1. Dakika göstergesi gerçekten ilerliyor mu?

- [ ] Maç detay sayfasını (`/matches/[slug]`) veya ana sayfadaki canlı satırı aç.
- [ ] Gösterilen dakikayı not et (örn. "23'").
- [ ] **En az 3-5 dakika bekle** (sayfayı yenile ya da otomatik polling'in çalışmasını izle
      — `MatchHubPage`'te canlı satırlar 30 saniyede bir `refreshHomeHubLiveFixtures`/
      `refreshUefaHubLiveFixtures` ile yenileniyor).
- [ ] Dakikanın gerçekten arttığını doğrula (örn. "23'" → "28'" gibi).
- [ ] Devre arasında (HT) dakikanın donduğunu/ayrı bir göstergeye (yarı sonu) geçtiğini kontrol et.
- [ ] İkinci yarı başladığında dakikanın 45'ten değil, kaldığı yerden (46', 47'...) devam
      ettiğini doğrula — `minuteDerivation.ts`'in `periods[].ticking` mantığı bunu
      garanti etmeli, ama SADECE statik fixture'larla test edildi, canlı akışta hiç
      gözlemlenmedi.
- **Beklenmedik bir şey görürsen not al:** dakika hiç değişmiyor mu, geriye mi gidiyor,
  yoksa 90+'da mı takılı kalıyor?

## 2. Skor gerçekten güncelleniyor mu?

- [ ] Skoru not et (örn. "1-0").
- [ ] Bir gol beklerken (ya da maçın ilerleyişini takip ederken) sayfayı periyodik
      yenile.
- [ ] Gol olduğunda skorun değiştiğini doğrula.
- [ ] `MatchCard`/`MatchList`'teki skorun (`scores.score`) VE maç detay sayfasındaki
      skorun (`scores.score`/`scores.ht_score`/`scores.ft_score`) TUTARLI olduğunu
      kontrol et.
- [ ] Devre arasında `ht_score`'un doğru donduğunu, maç bitince `ft_score`'un final
      skorla eşleştiğini doğrula.
- **Not:** `scoreDerivation.ts`'in `CURRENT`/`2ND_HALF` dalları artık gerçek (ama
  BİTMİŞ bir maça ait, statik) veriyle test edildi (`superLigFixture.json`) — burada
  asıl doğrulanması gereken, CANLI SIRADA (maç oynanırken) `CURRENT` satırının
  gerçekten güncel golle birlikte değiştiği.

## 3. State geçişleri doğru yakalanıyor mu? (NS→1st→HT→2nd→FT)

Maçın durumunu (`Match.status`) her aşamada not et — ideal olarak kickoff'tan itibaren:

- [ ] **Kickoff öncesi:** `NOT STARTED` gösteriliyor mu (Sportmonks `state_id:1`, "NS")?
- [ ] **Kickoff anı:** `NOT STARTED` → `IN PLAY` geçişi ne kadar gecikmeyle oluyor
      (Sportmonks tarafında `state_id:2`, "1st")? Birkaç dakika gecikme normal olabilir
      (polling aralığı + upstream veri gecikmesi).
- [ ] **Devre arası:** `IN PLAY` → `HALF TIME BREAK` geçişi doğru mu (`state_id:3`, "HT")?
- [ ] **2. yarı başlangıcı:** `HALF TIME BREAK` → `IN PLAY` geri dönüyor mu (`state_id:22`,
      "2nd" — `stateMapping.ts`'te de `IN PLAY` kovasına düşüyor)?
- [ ] **Maç sonu:** `IN PLAY` → `FINISHED` geçişi doğru mu (`state_id:5`, "FT")?
- [ ] Eğer uzatma/penaltı olursa (nadiren ama test şansı çıkarsa): `state_id:6/7/8/9`
      (et/AET/FTP/PEN) — `stateMapping.ts`'teki kova ataması (`IN PLAY`/`FINISHED`)
      doğru mu?
- **Kritik:** `MatchHubPage`'teki "Canlı" sekmesi filtresi `status === 'IN PLAY' ||
  status === 'HALF TIME BREAK'` şeklinde — devre arasındaki maçın "Canlı" sekmesinden
  KAYBOLMADIĞINI doğrula.

## 4. Yan kontroller (bonus, opsiyonel ama değerli)

- [ ] Tarayıcı konsolunda `/api/sportmonks/...` isteklerinden gelen bir hata/uyarı var mı?
- [ ] Network sekmesinde `/api/sportmonks/football/livescores/inplay` isteklerinin
      makul sıklıkta olduğunu (spam değil) doğrula.
- [ ] Sunucu loglarında (`[sportmonks] havuz=Fixture kalan=...`) kota tüketiminin
      makul bir hızda azaldığını gözlemle — maç boyunca kaç istek gittiğini kabaca not
      al (saatlik ~2500 sınırına göre oranla).
- [ ] Aynı maçın hem ana sayfa canlı listesinde hem maç detay sayfasında AYNI
      dakika/skor/state'i gösterdiğini doğrula (iki farklı endpoint — `/livescores/inplay`
      vs `/fixtures/{id}` — tutarlı olmalı).

---

## Bulguları kaydet

Bu checklist'i çalıştırdıktan sonra bulgularını (beklenmedik davranış varsa özellikle)
`docs/SPORTMONKS_MIGRATION_PLAN.md`'nin "Faz 4 — Doğrulama" bölümüne veya yeni bir
"Faz 4 — Canlı Doğrulama Sonucu" alt bölümüne not düşmek, gelecekte aynı riski tekrar
araştırmayı önler. Özellikle:
- Dakika/skor/state güncellemesinde beklenmedik bir gecikme/tutarsızlık gördün mü?
- `stateMapping.ts`'teki kova atamalarından (özellikle `note` alanı olan tartışmalı
  olanlar — `SUSP`, `INT`, `AU`, `DEL` gibi nadir durumlar) hiçbirini canlı olarak
  gözlemleme şansın oldu mu?
