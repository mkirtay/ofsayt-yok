// Sosyal medya varyant deneyi — saf skorlama mantığı (G/Ç yok, test edilebilir).

export interface Olcum {
  zaman: string; // ISO
  izlenme: number;
  ortSureSn?: number; // ortalama izlenme süresi
  paylasim: number;
  kaydet: number;
  begeni: number;
  yorum: number;
  takip: number;
}

export interface Varyant {
  kod: string; // A, B, C
  hook: string;
  platform: string;
  videoSn: number;
  yayinZamani: string; // ISO
  olcum?: Olcum;
}

export interface Deney {
  id: string;
  konu: string;
  olusturma: string;
  varyantlar: Varyant[];
}

/** Bir varyantın "izlenme başına" oranları. */
export interface Oranlar {
  tamamlanma: number | null; // ortSure / videoSn, 0–1.2
  paylasimKaydet: number; // (3*paylaşım + 2*kaydet) / izlenme
  takip: number;
  yorumBegeni: number; // (2*yorum + begeni) / izlenme
}

/** Skor ağırlıkları — toplamı 1. İzlenme süresi ve paylaşım/kaydetme beğeniden ağırdır. */
export const AGIRLIK = {
  tamamlanma: 0.4,
  paylasimKaydet: 0.3,
  takip: 0.15,
  yorumBegeni: 0.15,
} as const;

/** Bu izlenmenin altındaki varyant karara girmez: fark çoğu zaman şanstır. */
export const MIN_IZLENME = 300;
/** Birincinin ikinciyi geçmesi gereken göreli fark; altı "belirsiz". */
export const MIN_FARK = 0.15;
/** Ölçüm penceresi (saat). */
export const PENCERE_SAAT = [24, 32] as const;

export function oranlar(v: Varyant): Oranlar | null {
  const o = v.olcum;
  if (!o || o.izlenme <= 0) return null;
  return {
    tamamlanma:
      o.ortSureSn != null && v.videoSn > 0
        ? Math.min(o.ortSureSn / v.videoSn, 1.2)
        : null,
    paylasimKaydet: (3 * o.paylasim + 2 * o.kaydet) / o.izlenme,
    takip: o.takip / o.izlenme,
    yorumBegeni: (2 * o.yorum + o.begeni) / o.izlenme,
  };
}

export interface SkorSatiri {
  kod: string;
  skor: number; // 0–100
  izlenme: number;
  oranlar: Oranlar;
}

/**
 * Her ölçüt, kendi içinde en iyi varyanta göre 0–1'e çekilir; ağırlıklı ortalama alınır.
 * Hiçbir varyantta verisi olmayan ölçüt (ör. hepsi 0) ağırlıktan düşer.
 */
export function skorla(varyantlar: Varyant[]): SkorSatiri[] {
  const adaylar = varyantlar
    .map((v) => ({ v, r: oranlar(v) }))
    .filter((x): x is { v: Varyant; r: Oranlar } => x.r !== null);

  const anahtarlar = Object.keys(AGIRLIK) as (keyof typeof AGIRLIK)[];
  const enIyi = {} as Record<keyof typeof AGIRLIK, number>;
  for (const k of anahtarlar) {
    enIyi[k] = Math.max(0, ...adaylar.map((a) => a.r[k] ?? 0));
  }

  return adaylar
    .map(({ v, r }) => {
      let toplam = 0;
      let agirlik = 0;
      for (const k of anahtarlar) {
        if (enIyi[k] <= 0) continue;
        toplam += AGIRLIK[k] * ((r[k] ?? 0) / enIyi[k]);
        agirlik += AGIRLIK[k];
      }
      return {
        kod: v.kod,
        skor: agirlik > 0 ? Math.round((toplam / agirlik) * 1000) / 10 : 0,
        izlenme: v.olcum!.izlenme,
        oranlar: r,
      };
    })
    .sort((a, b) => b.skor - a.skor);
}

export type Karar =
  | { tip: 'kazanan'; kod: string; fark: number; uyarilar: string[] }
  | { tip: 'belirsiz'; neden: string; uyarilar: string[] }
  | { tip: 'veri-yok'; neden: string; uyarilar: string[] };

export function karar(d: Deney): Karar {
  const uyarilar: string[] = [];
  for (const v of d.varyantlar) {
    if (!v.olcum) continue;
    const saat =
      (Date.parse(v.olcum.zaman) - Date.parse(v.yayinZamani)) / 3_600_000;
    if (saat < PENCERE_SAAT[0] || saat > PENCERE_SAAT[1]) {
      uyarilar.push(
        `${v.kod}: ölçüm yayından ${saat.toFixed(1)} saat sonra (hedef ${PENCERE_SAAT[0]}–${PENCERE_SAAT[1]} sa) — varyantlar eşit koşulda kıyaslanmıyor olabilir.`,
      );
    }
  }

  const olcumlu = d.varyantlar.filter((v) => v.olcum);
  if (olcumlu.length < 2) {
    return { tip: 'veri-yok', neden: 'En az 2 varyantın ölçümü girilmeli.', uyarilar };
  }
  const yeterli = olcumlu.filter((v) => v.olcum!.izlenme >= MIN_IZLENME);
  if (yeterli.length < 2) {
    return {
      tip: 'belirsiz',
      neden: `En az 2 varyant ${MIN_IZLENME} izlenmeye ulaşmadı; bu kadar azda fark şans olur. Biraz daha bekle.`,
      uyarilar,
    };
  }

  const s = skorla(yeterli);
  const [ilk, ikinci] = s;
  const fark = ikinci.skor > 0 ? (ilk.skor - ikinci.skor) / ikinci.skor : 1;
  if (fark < MIN_FARK) {
    return {
      tip: 'belirsiz',
      neden: `${ilk.kod} (${ilk.skor}) ile ${ikinci.kod} (${ikinci.skor}) arası fark %${Math.round(fark * 100)} — eşik %${MIN_FARK * 100}. Net kazanan yok.`,
      uyarilar,
    };
  }
  return { tip: 'kazanan', kod: ilk.kod, fark, uyarilar };
}
