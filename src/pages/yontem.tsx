import Link from 'next/link';
import InfoPage from '@/components/InfoPage';
import { infoStyles as styles } from '@/components/InfoPage';
import { BRAND } from '@/config/brand';

/**
 * Yöntem (SEO/GEO raporu 2026-11-16): AI analizi nasıl üretilir, isabet nasıl ölçülür. Metin kodla uyumlu tutulmalı:
 * ölçüm = kart rozetindeki "en güçlü 3 tahmin" (utils/analysisTopPicks.ts), kapsam prompt v5+ (lib/loadAiStatsDashboard.ts).
 */
export default function YontemPage() {
  return (
    <InfoPage
      path="/yontem"
      title={`Yöntem: AI Maç Analizi ve İsabet Ölçümü | ${BRAND.name}`}
      heading="Yöntem: yapay zekâ maç analizi ve isabet ölçümü"
      description={`${BRAND.name} yapay zekâ maç analizlerinin hangi verilerle üretildiği, olasılıkların nasıl okunacağı ve isabet oranının nasıl hesaplandığı.`}
      lead={`${BRAND.name}'teki her yapay zekâ maç analizi aynı veri setiyle ve aynı kurallarla üretilir; sonuçları maç bittikten sonra otomatik olarak değerlendirir ve isabet oranını herkese açık yayımlarız.`}
      schemaType="WebPage"
      updated="16 Kasım 2026"
    >
      <section className={styles.section}>
        <h2>1. Hangi veriler kullanılıyor?</h2>
        <ul>
          <li>İki takımın son maçlarındaki form, attığı ve yediği goller, iç saha / deplasman ayrımı.</li>
          <li>Karşılıklı maç geçmişi ve lig sıralaması.</li>
          <li>Açıklanmışsa ilk 11&apos;ler; sakat ve cezalı oyuncular.</li>
          <li>Maç bağlamı: hakem istatistikleri, dinlenme süresi, derbi / kupa maçı, hava durumu, bir sonraki maç.</li>
        </ul>
        <p>Model yalnız bu verilerle çalışır; internette arama yapmaz, haber ya da söylenti kullanmaz.</p>
      </section>

      <section className={styles.section}>
        <h2>2. Çıktı: olasılıklar</h2>
        <p>
          Analiz; maç sonucu (ev sahibi / beraberlik / deplasman) ve gol beklentileri (1,5 / 2,5 / 3,5 üstü, karşılıklı gol, ilk yarı golü,
          takımların gol atması) için yüzde olasılık verir.
        </p>
        <p>
          <strong>Kalibrasyon (22 Kasım 2026&apos;dan beri):</strong> modelin ham olasılıkları, geçmiş maçlarda o yüzdenin gerçekte
          ne sıklıkla tuttuğuna göre düzeltilir (isotonic regresyon; bir olasılık en fazla 15 puan oynar). Amaç, kartta %70 yazan
          tahminlerin gerçekten yaklaşık %70&apos;inde gerçekleşmesidir.
        </p>
        <p>
          <strong>Öne çıkan 3 tahmin:</strong> olasılığı %50&apos;nin üstünde olan tahminler içinden <em>temel orandan</em> en çok
          ayrılan üçü seçilir. Temel oran, o olayın tüm maçlarda ne sıklıkla olduğudur (ör. 2+ gol maçların yaklaşık %80&apos;inde
          olur; bunu söylemek bilgi katmaz). 22 Kasım 2026&apos;dan önceki analizlerde en yüksek olasılıklı üç tahmin gösteriliyordu.
        </p>
      </section>

      <section className={styles.section}>
        <h2>3. İsabet nasıl ölçülüyor?</h2>
        <ul>
          <li>Maç bittiğinde resmî skor alınır ve kartta gösterilen en güçlü 3 tahminin her biri tuttu / tutmadı olarak işaretlenir.</li>
          <li>İsabet oranı = tutan tahmin sayısı ÷ değerlendirilen tahmin sayısı.</li>
          <li>Yalnız güncel model ailesinin (3 Ekim 2026&apos;dan beri) analizleri sayılır; ertelenen, iptal edilen ya da skoru doğrulanamayan maçlar dışarıda kalır.</li>
          <li>Seçim, karttakiyle birebir aynıdır: sonradan seçilmiş ya da gizlenmiş tahmin yoktur.</li>
          <li>
            İsabetin yanında temel oran (aynı tahmin türleri her maçta söylenseydi beklenen isabet), Brier skoru ve kalibrasyon grafiği
            yayımlanır; çıplak isabet oranı tek başına modelin becerisini göstermez.
          </li>
        </ul>
        <p>
          Güncel oran ve maç maç liste: <Link href="/ai-istatistikleri">AI isabet istatistikleri</Link>.
        </p>
      </section>

      <section className={styles.section}>
        <h2>4. Sınırlar</h2>
        <p>
          Olasılık kesinlik değildir: %70 olasılık verilen bir sonucun on maçtan yaklaşık üçünde gerçekleşmemesi beklenir. Son dakika kadro
          değişiklikleri ve verisi olmayan etkenler analize yansımaz. Analizler bilgi amaçlıdır; {BRAND.name} bahis sitesi değildir ve oran
          yayımlamaz.
        </p>
      </section>
    </InfoPage>
  );
}
