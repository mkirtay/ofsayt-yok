# UI Redesign Notes

## Header

- Background color: `#00a76f`
- Sol: Logo "OFSAYT YOK!" (bold/italic)
- Sag: "Giris Yap" (outline, #fff) ve "Uye Ol" (filled, #000) butonlari
- Butonlar tek komponent, 2 varyasyon (outline / filled)

## SubHeader

- Sol: Tarih navigasyonu (ok butonlari ile gun degistirme, "8 Nisan Carsamba" formatinda)
- Orta: Tab yapisi -- Hepsi | Canli | Bitmis | Favoriler
- Sag: "Zamana Gore Sirala" (dummy)

## Tab Filtreleme

| Tab       | Veri Kaynagi                                     | Filtreleme                                        |
|-----------|--------------------------------------------------|---------------------------------------------------|
| Hepsi     | getMatchesByDate(selectedDate) + getLiveMatches   | Hepsini goster                                    |
| Canli     | getLiveMatches()                                  | status === 'IN PLAY' veya 'HALF TIME BREAK'       |
| Bitmis    | getMatchesByDate(selectedDate)                    | status === 'FINISHED'                             |
| Favoriler | localStorage'dan favori mac ID'leri               | Dummy/bos durum simdilik                          |

## Lig Siralama

### Tier 1 -- Turkiye

1. Trendyol Super Lig -- `competition_id: 6`
2. Trendyol 1. Lig -- `competition_id: 344`
3. Turkiye Kupasi -- `competition_id: 347`

### Tier 2 -- UEFA

4. Sampiyonlar Ligi -- `competition_id: 245`
5. UEFA Avrupa Ligi -- `competition_id: 244`
6. UEFA Konferans Ligi -- `competition_id: 446`

### Tier 3 -- Buyuk 5 (yeni sira)

7. Ingiltere Premier Lig -- `competition_id: 2`
8. Almanya Bundesliga -- `competition_id: 1`
9. Ispanya La Liga -- `competition_id: 3`
10. Italya Serie A -- `competition_id: 4`
11. Fransa Ligue 1 -- `competition_id: 5`

### Tier 4 -- Digerleri

- Ulke adina gore (tr locale), sonra lig adina gore siralanir

## Notlar

- Dunya Kupasi simdilik eklenmeyecek
- `$color-primary` degeri `#00a76f` olarak guncellenecek
- Favoriler sekmesi simdilik dummy/placeholder
