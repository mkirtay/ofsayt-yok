import Head from 'next/head';
import Container from '@/components/Container';
import { usePremium } from '@/hooks/usePremium';
import styles from './premium.module.scss';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Maç Analizi',
    desc: 'Her maç için yapay zeka destekli derinlemesine analiz.',
    bullets: [
      '1X2 sonuç olasılıkları (%)',
      'Skor tahmini ve alternatifleri',
      'Gol beklentisi (Üst 1.5/2.5/3.5, KG Var)',
      'Takım form ve strateji analizi',
      'Bahis önerileri + risk seviyesi',
    ],
  },
  {
    icon: '⚡',
    title: 'Maç Trivias',
    desc: 'Her maça özel ilginç istatistikler ve hikayeler.',
    bullets: [
      'Bilinmeyen istatistikler',
      'Rekabet ve tarih bağlamı',
      'Oyuncu ve kadro analizleri',
      'Saha avantajı değerlendirmesi',
    ],
  },
  {
    icon: '📊',
    title: 'AI İsabeti Takibi',
    desc: 'Yapay zekanın geçmiş tahminlerinin doğruluk raporu.',
    bullets: [
      '1X2 tahmin isabetlilik oranı',
      'Tam skor isabetlilik oranı',
      'Model bazlı performans karşılaştırması',
      'Maç bazlı detaylı geçmiş',
    ],
  },
];

const COMPARE_ROWS = [
  { label: 'Canlı skorlar', free: true, premium: true },
  { label: 'Puan durumu & istatistikler', free: true, premium: true },
  { label: 'Takım sayfaları & H2H karşılaştırma', free: true, premium: true },
  { label: 'Maç yorumları', free: true, premium: true },
  { label: 'Tahmin anketi', free: true, premium: true },
  { label: 'AI Maç Analizi', free: false, premium: true },
  { label: 'Maç Trivias', free: false, premium: true },
  { label: 'AI İsabeti geçmişi', free: false, premium: true },
];

const FAQ = [
  {
    q: 'Ödeme sistemi ne zaman aktif olacak?',
    a: 'Stripe entegrasyonu çok yakında tamamlanacak. O zamana kadar bildirim almak için sosyal medyamızı takip edin.',
  },
  {
    q: 'Premium üyeliği iptal edebilir miyim?',
    a: 'Evet. İstediğin zaman iptal edebilirsin. Kalan süren bitmeden üyeliğin devam eder.',
  },
  {
    q: 'AI analizleri ne kadar güvenilir?',
    a: 'Analizler GPT tabanlı modellerle üretilmekte, form verileri ve H2H istatistikleri ile beslenmektedir. AI İsabeti sayfasında isabetlilik oranlarını takip edebilirsin.',
  },
  {
    q: 'Yıllık planda aylık planla aynı özellikler var mı?',
    a: 'Evet, tüm özellikler aynı. Yıllık planda 3 ay ücretsiz avantaj sunuyoruz.',
  },
];

export default function PremiumPage() {
  const { isPremium, loading } = usePremium();

  return (
    <>
      <Head>
        <title>Premium — Ofsayt Yok</title>
        <meta
          name="description"
          content="AI destekli maç analizi, skor tahmini ve bahis önerileri için Ofsayt Yok Premium."
        />
      </Head>

      <Container>
        <div className={styles.page}>
          {!loading && isPremium && (
            <div className={styles.alreadyPremium}>
              <h3>⭐ Zaten Premium Üyesin!</h3>
              <p>Tüm premium içeriklere erişimin aktif. Maç sayfalarında AI analizleri ve Trivia bölümlerini kullanabilirsin.</p>
            </div>
          )}

          {/* Hero */}
          <section className={styles.hero}>
            <div className={styles.heroBadge}>⭐ Premium</div>
            <h1 className={styles.heroTitle}>
              Futbolu <span>analiz yapan</span> taraftan izle
            </h1>
            <p className={styles.heroSub}>
              Yapay zeka destekli skor tahminleri, takım form analizleri ve maça özel
              istatistiklerle bir adım öne geç.
            </p>
          </section>

          {/* Özellikler */}
          <section>
            <h2 className={styles.sectionTitle}>Premium Neler Sunar?</h2>
            <div className={styles.featuresGrid}>
              {FEATURES.map((f) => (
                <div key={f.title} className={styles.featureCard}>
                  <span className={styles.featureCardIcon}>{f.icon}</span>
                  <div className={styles.featureCardTitle}>{f.title}</div>
                  <p className={styles.featureCardDesc}>{f.desc}</p>
                  <ul className={styles.featureCardBullets}>
                    {f.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {/* Karşılaştırma tablosu */}
          <section className={styles.compareWrap}>
            <h2 className={styles.sectionTitle}>Ücretsiz vs Premium</h2>
            <table className={styles.compareTable}>
              <thead className={styles.tableHead}>
                <tr>
                  <th>Özellik</th>
                  <th>Ücretsiz</th>
                  <th>
                    <span className={styles.premiumHeader}>⭐ Premium</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td className={row.free ? styles.hit : styles.miss}>
                      {row.free ? '✓' : '—'}
                    </td>
                    <td className={`${styles.premiumCol} ${styles.hit}`}>✓</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Fiyatlandırma */}
          <section className={styles.pricingSection}>
            <h2 className={styles.sectionTitle}>Fiyatlandırma</h2>
            <div className={styles.pricingCards}>
              {/* Aylık */}
              <div className={styles.pricingCard}>
                <div className={styles.pricingPeriod}>Aylık</div>
                <div className={styles.pricingAmount}>
                  <sup>₺</sup>79<sub>/ay</sub>
                </div>
                <div className={styles.pricingNote}>&nbsp;</div>
                <ul className={styles.pricingFeatures}>
                  <li>Tüm AI özellikleri</li>
                  <li>Sınırsız maç analizi</li>
                  <li>İstediğin zaman iptal</li>
                </ul>
                <div className={styles.buyBtn}>
                  Satın Al <span className={styles.buyBtnSoon}>Yakında</span>
                </div>
              </div>

              {/* Yıllık */}
              <div className={`${styles.pricingCard} ${styles.pricingCardFeatured}`}>
                <div className={styles.pricingPopular}>En Popüler</div>
                <div className={styles.pricingPeriod}>Yıllık</div>
                <div className={styles.pricingAmount}>
                  <sup>₺</sup>699<sub>/yıl</sub>
                </div>
                <div className={styles.pricingNote}>Ayda ~58 ₺ • 3 ay ücretsiz</div>
                <ul className={styles.pricingFeatures}>
                  <li>Tüm AI özellikleri</li>
                  <li>Sınırsız maç analizi</li>
                  <li>Öncelikli destek</li>
                  <li>Yeni özelliklere erken erişim</li>
                </ul>
                <div className={`${styles.buyBtn} ${styles.buyBtnFeatured}`}>
                  Satın Al <span className={styles.buyBtnSoon}>Yakında</span>
                </div>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className={styles.faqSection}>
            <h2 className={styles.sectionTitle}>Sıkça Sorulan Sorular</h2>
            {FAQ.map((item) => (
              <div key={item.q} className={styles.faqItem}>
                <div className={styles.faqQ}>{item.q}</div>
                <p className={styles.faqA}>{item.a}</p>
              </div>
            ))}
          </section>
        </div>
      </Container>
    </>
  );
}
