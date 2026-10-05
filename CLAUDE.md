# CLAUDE.md

## Doğrulama ve ölçüm politikası

- **Her commit:** değişen alanın testleri + tip kontrolü.
- **Tam test seti (temiz worktree):** yalnızca push'tan önce, gönderilecek en üst commit'te.
- **Lighthouse:** yalnızca sayfa yüküne dokunan değişikliklerde (ana sayfa / maç / takım sayfası ilk görünümü,
  CSS/JS paketleri, fontlar, yerleşim). API, sunucu, metin/çeviri, belge ve test değişikliklerinde ölçüm yok.
  Ölçülecekse yerelde 3 koşu, medyan.
- **Asıl performans ölçümü deploy sonrası canlıda:** ilgili sayfalarda mobil Lighthouse 3 koşu.
- **Ekran görüntüsü:** yalnızca görsel değişikliklerde.
- Aynı anda birden fazla oturum çalıştığı için yerel ölçümlerde sapma normaldir; şüpheli bir düşüşte bir kez
  tekrar ölç, kalıcıysa raporla.

## Paralel oturumlar ve git

- Paralel oturumlar aynı git index'ini paylaşır; commit'leri yalnız kendi dosya yollarınla at:
  `git commit -o -- <yollar>`. `git add -A` / yolsuz `git commit` kullanma.
