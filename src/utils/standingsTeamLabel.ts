/**
 * Puan durumunda takım adı: tam isim mi kısaltma mı ("Galatasaray" / "GAL").
 *
 * KURAL (web + mobil aynı):
 *  1. Karar TABLONUN KAPSAYICI GENİŞLİĞİNE göre verilir, viewport'a göre değil — aynı bileşen ana sayfa sol
 *     panelinde, takım sayfası yan panelinde, maç detayında ve mobilde farklı genişlikte duruyor.
 *     Kapsayıcı `STANDINGS_COMPACT_MAX_WIDTH` pikselden DARSA → kompakt (kısaltma); eşit/genişse → tam isim.
 *  2. Kompaktta takımın geçerli `short_code`'u varsa logo + kısaltma ("GAL"); yoksa tam isim + mevcut ellipsis.
 *  3. Kısaltma gösterilirken erişilebilir ad ve tooltip HER ZAMAN tam isimdir (`title` + `aria-label`).
 *  4. Mini widget (4 sütun: sıra/logo/ad/puan) ayrı eşik kullanır: `MINI_STANDINGS_COMPACT_MAX_WIDTH`.
 *
 * Web: isimsiz CSS container query (`@container (max-width: …)`), iki span birlikte basılır, biri gizlenir →
 * SSR/hidrasyon farkı ve JS ölçümü yok. Mobil (React Native): tablo kapsayıcısının `onLayout` genişliğiyle
 * `standingTeamLabel(row, width < STANDINGS_COMPACT_MAX_WIDTH)` çağrılır.
 *
 * Eşik gerekçesi (10 sütunlu tablo, 11px — tarayıcıda ölçüldü): sıra + 8 sayı sütunu ≈ 208px sabit; takım hücresinde
 * logo + boşluk + padding ≈ 34px. Uzun adlar (600 11px Inter: "İstanbul Başakşehir" 104px, "Borussia Mönchengladbach"
 * 148px) kapsayıcı ~390px'in altında kesilmeye başlıyor → 400px. Masaüstü ana sayfa sol paneli (~238px), takım
 * sayfası yan paneli ve telefonlar (375px → ~343px) altında; /standings tam tablosu ve geniş maç detayı üstünde.
 */
export const STANDINGS_COMPACT_MAX_WIDTH = 400;
/** Mini widget'ta sabit sütunlar ≈ 80px; ad alanı ~140px'in altına inince (kapsayıcı < 220px) kısaltma. */
export const MINI_STANDINGS_COMPACT_MAX_WIDTH = 220;

type RowLike = {
  team?: { name?: string; short_code?: string | null };
  name?: string;
  short_code?: string | null;
};

/** Geçerli kısaltma: 2–5 harf/rakam (Sportmonks bazen boş string/null gönderiyor). Büyük harfe çevrilir. */
export function standingTeamShortCode(row: RowLike): string | undefined {
  const raw = (row.team?.short_code ?? row.short_code ?? '').trim();
  return /^[\p{L}\p{N}]{2,5}$/u.test(raw) ? raw.toLocaleUpperCase('tr-TR') : undefined;
}

export function standingTeamFullName(row: RowLike): string {
  return row.team?.name || row.name || '—';
}

export type StandingTeamLabel = {
  /** Ekranda görünen metin */
  text: string;
  /** Kısaltma mı gösteriliyor (true ise `title`/`ariaLabel` tam isim) */
  abbreviated: boolean;
  /** Tooltip + erişilebilir ad — her zaman tam isim */
  fullName: string;
};

/** `compact`: kapsayıcı eşikten dar mı (web'de CSS karar verir; mobil/test için saf fonksiyon). */
export function standingTeamLabel(row: RowLike, compact: boolean): StandingTeamLabel {
  const fullName = standingTeamFullName(row);
  const code = compact ? standingTeamShortCode(row) : undefined;
  return code ? { text: code, abbreviated: true, fullName } : { text: fullName, abbreviated: false, fullName };
}
