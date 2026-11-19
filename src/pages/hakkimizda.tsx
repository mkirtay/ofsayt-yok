import Link from 'next/link';
import InfoPage from '@/components/InfoPage';
import { infoStyles as styles } from '@/components/InfoPage';
import { BRAND, GAME_BRAND } from '@/config/brand';

/** Hakkımızda (SEO/GEO raporu 2026-11-16: güven sinyali — kim, hangi veri, ne değil). Statik. */
export default function HakkimizdaPage() {
  return (
    <InfoPage
      path="/hakkimizda"
      title={`Hakkımızda | ${BRAND.name}`}
      heading={`${BRAND.name} hakkında`}
      description={`${BRAND.name}: canlı skor, maç sonuçları, puan durumu, hakem ve teknik direktör istatistikleri ile yapay zekâ maç analizi sunan Türkçe futbol veri sitesi. Bahis sitesi değildir.`}
      lead={`${BRAND.name} (okunuşu "skor üç"), futbolu veriyle takip etmek isteyenler için Türkçe bir futbol veri ve analiz sitesidir: canlı skor, maç sonuçları, puan durumu, hakem ve teknik direktör istatistikleri ve her maç için yapay zekâ analizi.`}
      schemaType="AboutPage"
      updated="16 Kasım 2026"
    >
      <section className={styles.section}>
        <h2>Ne sunuyoruz?</h2>
        <ul>
          <li>Süper Lig, 1. Lig, Avrupa&apos;nın büyük ligleri ve UEFA turnuvaları dahil 30&apos;u aşkın ligde canlı skor, maç sonucu ve maç istatistiği.</li>
          <li>
            <Link href="/lig">Lig sayfaları</Link>: güncel puan durumu ve gol krallığı.
          </li>
          <li>
            <Link href="/hakemler">Hakem istatistikleri</Link>: maç başı kart ve penaltı ortalamaları; teknik direktör sayfaları.
          </li>
          <li>Her maç için yapay zekâ analizi: form, karşılıklı maçlar, kadro, sakat/cezalı oyuncular ve maç bağlamından olasılık tahmini.</li>
          <li>
            Ücretsiz oyunlar: <Link href={GAME_BRAND.basePath}>{GAME_BRAND.name}</Link> ve <Link href="/frikik">Frikik</Link>; taraftar tartışmaları için{' '}
            <Link href="/gundem">Gündem</Link>.
          </li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Veri kaynakları</h2>
        <p>
          Maç, takım, oyuncu, hakem ve puan durumu verileri lisanslı spor veri sağlayıcılarından gelir: kulüp maçları için Sportmonks,
          milli takım maçları için API-Football. Canlı veriler birkaç saniye ile birkaç dakika arasında güncellenir; resmî sonuç ve
          sıralamalar için ilgili federasyonun açıklaması esastır.
        </p>
      </section>

      <section className={styles.section}>
        <h2>Yapay zekâ analizi nasıl çalışır?</h2>
        <p>
          Analizler büyük dil modeliyle, yalnız maça ait veriler verilerek üretilir; model internette arama yapmaz. Analizlerin ne kadar
          tuttuğunu herkese açık olarak yayımlıyoruz: <Link href="/ai-istatistikleri">AI isabet istatistikleri</Link>. Ölçüm yöntemi{' '}
          <Link href="/yontem">Yöntem</Link> sayfasında.
        </p>
      </section>

      <section className={styles.section}>
        <h2>{BRAND.name} ne değildir?</h2>
        <p>
          {BRAND.name} bir bahis ya da şans oyunu sitesi değildir; para yatırılmaz, kupon oynatılmaz, oran yayımlanmaz. {GAME_BRAND.name} ve Frikik
          ücretsizdir. Yapay zekâ analizleri bilgi amaçlıdır ve kesinlik iddiası taşımaz.
        </p>
      </section>

      <section className={styles.section}>
        <h2>İletişim</h2>
        <p>
          Görüş, hata bildirimi ve iş birliği için <Link href="/iletisim">iletişim sayfası</Link>. Sosyal medyada <strong>getscor3</strong>{' '}
          adıyla yer alıyoruz.
        </p>
      </section>
    </InfoPage>
  );
}
