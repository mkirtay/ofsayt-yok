/**
 * Sportmonks `state_id` → mevcut `Match.status`'ın kullandığı 4 kova.
 *
 * Kaynak: docs/SPORTMONKS_MIGRATION.md "Genel bulgular" madde 4 — gerçek
 * `/states` endpoint'inden alınan 26 satırlık liste (dokümantasyon sayfasının
 * özetiyle ÇELİŞEN kısımlar var: döküman "INPLAY_1ST_HALF" diyor, gerçek API
 * `short_name:"1st"` döndürüyor — bu yüzden burada DOKÜMANA değil, raporda
 * kayıtlı gerçek `short_name` değerlerine göre eşleme yapılıyor).
 *
 * ÖNEMLİ: `short_name` BENZERSİZ DEĞİL — id 9 ("Penalties", canlı penaltılar)
 * ve id 26 ("Pending") ikisi de `short_name:"PEN"`. Bu yüzden eşleme
 * `short_name` string'i üzerinden DEĞİL, `state_id` (sayısal) üzerinden
 * yapılıyor — string anahtarlı bir sözlük bu ikisini birbirine ezerdi.
 */
import type { SportmonksState } from './types';

export type MatchPhaseBucket = 'NOT STARTED' | 'IN PLAY' | 'HALF TIME BREAK' | 'FINISHED';

type StateBucketEntry = {
  shortName: string;
  bucket: MatchPhaseBucket;
  /** Eşlemenin gerekçesi — raporda net olmayan/yorum gerektiren durumlar için. */
  note?: string;
};

/**
 * Raporun 26 satırlık tablosunun BİREBİR karşılığı, `state_id` anahtarlı.
 * Kova seçimleri mevcut 4-kovalı modelin en yakın anlamına göre yapıldı;
 * rapor bu eşlemeyi dikte etmiyor (sadece "yeni bir mapping tablosu şart"
 * diyor), bu yüzden tartışmalı olanlar `note` ile işaretlendi.
 */
export const SPORTMONKS_STATE_BUCKETS: Record<number, StateBucketEntry> = {
  1: { shortName: 'NS', bucket: 'NOT STARTED' },
  2: { shortName: '1st', bucket: 'IN PLAY' },
  3: { shortName: 'HT', bucket: 'HALF TIME BREAK' },
  4: { shortName: 'BRK', bucket: 'HALF TIME BREAK', note: 'Genel "ara" — en yakın kova devre arası.' },
  5: { shortName: 'FT', bucket: 'FINISHED' },
  6: { shortName: 'et', bucket: 'IN PLAY', note: 'Uzatma devam ediyor, hâlâ canlı.' },
  7: { shortName: 'AET', bucket: 'FINISHED' },
  8: { shortName: 'FTP', bucket: 'FINISHED' },
  9: { shortName: 'PEN', bucket: 'IN PLAY', note: 'Canlı penaltı atışları (id 26 ile short_name çakışıyor, id ile ayrıştırıldı).' },
  10: { shortName: 'POST', bucket: 'NOT STARTED', note: 'Ertelendi — henüz oynanmadı.' },
  11: { shortName: 'SUSP', bucket: 'HALF TIME BREAK', note: 'Maç ortasında askıya alınmış = duraklama.' },
  12: { shortName: 'CANC', bucket: 'FINISHED', note: 'İptal — bir daha oynanmayacak, "bitti" kovasına en yakın.' },
  13: { shortName: 'TBA', bucket: 'NOT STARTED' },
  14: { shortName: 'WO', bucket: 'FINISHED', note: 'Hükmen sonuç — nihai.' },
  15: { shortName: 'ABAN', bucket: 'FINISHED', note: 'Terk edildi — nihai.' },
  16: { shortName: 'DELA', bucket: 'NOT STARTED', note: 'Başlangıcı gecikti, henüz başlamadı.' },
  17: { shortName: 'AWAR', bucket: 'FINISHED', note: 'Hükmen verildi — nihai.' },
  18: { shortName: 'INT', bucket: 'HALF TIME BREAK', note: 'Kesintiye uğradı = duraklama.' },
  19: { shortName: 'AU', bucket: 'IN PLAY', note: 'Veri güncellemesi bekleniyor ama maç muhtemelen sürüyor — tartışmalı, IN PLAY seçildi.' },
  20: { shortName: 'DEL', bucket: 'FINISHED', note: 'Silinmiş fixture — canlı akışta gösterilmeyecek, en yakın "bitti".' },
  21: { shortName: 'ETB', bucket: 'HALF TIME BREAK', note: 'Uzatma arası = duraklama.' },
  22: { shortName: '2nd', bucket: 'IN PLAY' },
  23: { shortName: '2et', bucket: 'IN PLAY', note: 'Uzatmanın 2. yarısı, hâlâ canlı.' },
  25: { shortName: 'PENB', bucket: 'HALF TIME BREAK', note: 'Penaltılar arası = duraklama.' },
  26: { shortName: 'PEN', bucket: 'NOT STARTED', note: 'Pending — id 9 ile short_name çakışıyor, id ile ayrıştırıldı.' },
};

/**
 * Bir Sportmonks `state_id`'sini mevcut `Match.status` kovasına çevirir.
 * Bilinmeyen bir `state_id` gelirse (rapor kapsamı dışında yeni bir durum
 * eklenmişse) güvenli varsayılan olarak `'NOT STARTED'` döner.
 */
export function mapSportmonksStateToPhase(stateId: number): MatchPhaseBucket {
  return SPORTMONKS_STATE_BUCKETS[stateId]?.bucket ?? 'NOT STARTED';
}

/** `SportmonksState` objesinden (id + short_name birlikte) kova türetir — id önceliklidir. */
export function mapSportmonksStateObjectToPhase(state: Pick<SportmonksState, 'id'>): MatchPhaseBucket {
  return mapSportmonksStateToPhase(state.id);
}
