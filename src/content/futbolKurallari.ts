/**
 * Futbol Kuralları içerik merkezi (SEO/GEO planı 2026-11-16): hub `/futbol-kurallari` + makaleler `/futbol-kurallari/{slug}`.
 * Statik metin; veri isteği yok. Satır içi biçim: `**kalın**` ve `[etiket](/yol)` (yalnız site içi yol).
 * Kurallar her yıl 1 Temmuz'da değişir: IFAB değişikliklerinden sonra metni ve `updated` / `updatedIso` alanlarını güncelleyin.
 * Yayın öncesi teyit listesi: docs/FUTBOL_KURALLARI_PLANI.md.
 */

export type RuleBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'offsideDiagram' }
  /** Ceza sahası ölçü şeması (Kural 1). */
  | { type: 'pitchDiagram' };

export type RuleSection = { id: string; heading: string; blocks: RuleBlock[] };
export type RuleFaq = { q: string; a: string };

export type RuleArticle = {
  /** '' = hub (/futbol-kurallari). */
  slug: string;
  /** <title> (marka eki sayfada eklenir). */
  title: string;
  heading: string;
  description: string;
  /** İlk paragraf: soruya 2–3 cümlede net cevap. */
  lead: string;
  badge: string;
  sections: RuleSection[];
  faq: RuleFaq[];
  /** Görünen tarih + şema (ISO). */
  updated: string;
  updatedIso: string;
  publishedIso: string;
};

export const RULES_HUB_PATH = '/futbol-kurallari';

const UPDATED = '16 Kasım 2026';
const UPDATED_ISO = '2026-11-16';

export const RULES_HUB: RuleArticle = {
  slug: '',
  title: 'Futbol Kuralları 2026: 17 Kuralın Kısa Rehberi',
  heading: 'Futbol Kuralları: 17 Kuralın Kısa ve Net Rehberi',
  description: 'Futbolun 17 kuralını sade bir dille anlattık: saha, oyuncular, ofsayt, fauller, penaltı ve 2026-27 sezonu güncellemeleri.',
  lead:
    "**Futbol kuralları**, Uluslararası Futbol Birliği Kurulu (IFAB) tarafından belirlenen ve dünyanın her yerinde aynı uygulanan **17 kuraldan** oluşur. Bu kurallar sahanın ölçülerinden ofsayta, fauldan penaltıya kadar maçtaki her durumu düzenler. IFAB kuralları her yıl günceller; yeni kurallar her sezon **1 Temmuz**'da yürürlüğe girer. Bu rehber 2026-27 sezonu kurallarına göre hazırlanmıştır.",
  badge: 'Rehber',
  updated: UPDATED,
  updatedIso: UPDATED_ISO,
  publishedIso: UPDATED_ISO,
  sections: [
    {
      id: 'kural-1',
      heading: 'Kural 1 – Oyun Alanı',
      blocks: [
        {
          type: 'p',
          text: 'Saha dikdörtgendir. Uluslararası maçlarda uzunluk 100–110 m, genişlik 64–75 m olmalıdır. Kale 7,32 m genişliğinde ve 2,44 m yüksekliğindedir. Penaltı noktası kale çizgisinden 11 m, ceza sahası 16,5 m içeridedir. Tüm ölçüler şemasıyla: [Futbol sahası ölçüleri](/futbol-kurallari/saha-olculeri).',
        },
      ],
    },
    {
      id: 'kural-2',
      heading: 'Kural 2 – Top',
      blocks: [{ type: 'p', text: 'Top küresel olmalı, çevresi 68–70 cm ve ağırlığı maç başında 410–450 g arasında olmalıdır.' }],
    },
    {
      id: 'kural-3',
      heading: 'Kural 3 – Oyuncular',
      blocks: [
        {
          type: 'p',
          text: "Her takım sahaya en fazla 11 oyuncuyla (biri kaleci) çıkar. Bir takımın oyuncu sayısı **7'nin altına düşerse maç başlamaz veya devam etmez**. Resmî maçlarda genellikle 5 değişiklik hakkı vardır ve bu değişiklikler devre arası hariç en fazla 3 seferde yapılır. 2026-27 ile birlikte oyundan çıkan oyuncu sahayı **10 saniye** içinde terk etmek zorundadır.",
        },
      ],
    },
    {
      id: 'kural-4',
      heading: 'Kural 4 – Oyuncu Ekipmanı',
      blocks: [
        {
          type: 'p',
          text: 'Forma, şort, tozluk, tekmelik ve ayakkabı zorunludur. Tehlikeli takı ve aksesuar yasaktır; yeni kurala göre tehlikeli eşyayı bantla kapatmak da yeterli değildir, çıkarılmalıdır.',
        },
      ],
    },
    {
      id: 'kural-5',
      heading: 'Kural 5 – Hakem',
      blocks: [
        {
          type: 'p',
          text: 'Hakem kuralları uygulamakla tam yetkilidir; kararları kesindir. [VAR](/futbol-kurallari/var), gol çizgisi teknolojisi ve yarı otomatik ofsayt teknolojisi hakeme yardımcı olabilir, ama son kararı her zaman sahadaki hakem verir.',
        },
      ],
    },
    {
      id: 'kural-6',
      heading: 'Kural 6 – Diğer Maç Görevlileri',
      blocks: [
        {
          type: 'p',
          text: 'Yardımcı hakemler, dördüncü hakem, VAR ve AVAR. Görevleri hakeme ofsayt, taç, korner ve görmediği olaylar hakkında bilgi vermektir.',
        },
      ],
    },
    {
      id: 'kural-7',
      heading: 'Kural 7 – Maçın Süresi',
      blocks: [
        {
          type: 'p',
          text: "Maç 45'er dakikalık iki devreden oluşur; devre arası en fazla 15 dakikadır. Oyuncu değişikliği, sakatlık, VAR incelemesi ve zaman geçirme gibi kayıplar uzatma olarak eklenir ([uzatma dakikaları nasıl hesaplanır?](/futbol-kurallari/uzatma)).",
        },
      ],
    },
    {
      id: 'kural-8',
      heading: 'Kural 8 – Oyunun Başlaması ve Yeniden Başlaması',
      blocks: [
        {
          type: 'p',
          text: "Maç santrayla başlar; santradan doğrudan gol atılabilir. Hakem topu (drop ball) kuralı 2026-27'de netleşti: top, topu kazanacak ya da elinde tutacak olan takıma bırakılır.",
        },
      ],
    },
    {
      id: 'kural-9',
      heading: 'Kural 9 – Topun Oyunda ve Dışarıda Olması',
      blocks: [
        {
          type: 'p',
          text: 'Top, yerde veya havada çizgiyi **tamamen** geçtiğinde dışarıdadır. Topun bir kısmı bile çizginin üzerindeyse oyun devam eder.',
        },
      ],
    },
    {
      id: 'kural-10',
      heading: 'Kural 10 – Sonucun Belirlenmesi',
      blocks: [
        {
          type: 'p',
          text: 'Topun tamamı iki direk arasından ve üst direğin altından kale çizgisini geçerse goldür. Eşitlik bozulmazsa yarışma kurallarına göre uzatma ve/veya [penaltı atışlarına](/futbol-kurallari/penalti) gidilir.',
        },
      ],
    },
    {
      id: 'kural-11',
      heading: 'Kural 11 – Ofsayt',
      blocks: [
        {
          type: 'p',
          text: 'Pas verildiği anda topun ve sondan ikinci rakip oyuncunun önünde, rakip yarı sahada bulunan ve oyuna müdahale eden oyuncu ofsayttadır. Taç, korner ve kale vuruşundan ofsayt olmaz. (Detay: [Ofsayt Kuralı Nedir?](/futbol-kurallari/ofsayt))',
        },
      ],
    },
    {
      id: 'kural-12',
      heading: 'Kural 12 – Fauller ve Kötü Davranış',
      blocks: [
        {
          type: 'p',
          text: 'Dikkatsiz, umursamaz ya da aşırı güç kullanılarak yapılan hareketler faul sayılır. Sarı kart uyarı, kırmızı kart oyundan atılmadır. İki sarı kart bir kırmızıya eşittir. Hakemlerin maç başına kart ortalamaları: [Hakem istatistikleri](/hakemler).',
        },
      ],
    },
    {
      id: 'kural-13',
      heading: 'Kural 13 – Serbest Vuruşlar',
      blocks: [
        {
          type: 'p',
          text: 'Direkt serbest vuruştan doğrudan gol atılabilir; endirekt serbest vuruşta topun gol olması için başka bir oyuncuya değmesi gerekir. Rakipler topa en az 9,15 m uzakta durmalıdır.',
        },
      ],
    },
    {
      id: 'kural-14',
      heading: 'Kural 14 – Penaltı Vuruşu',
      blocks: [
        {
          type: 'p',
          text: 'Kaleci vuruş anında en az bir ayağı kale çizgisinin üzerinde ya da hizasında olmalıdır. Atıcı topu ileri doğru vurmalıdır; topa ikinci kez dokunmadan önce başka bir oyuncunun topa değmesi gerekir. Ayrıntılar ve tekrar tablosu: [Penaltı kuralları](/futbol-kurallari/penalti).',
        },
      ],
    },
    {
      id: 'kural-15',
      heading: 'Kural 15 – Taç Atışı',
      blocks: [
        {
          type: 'p',
          text: "Top iki elle, başın arkasından ve iki ayak yerdeyken atılır. Taçtan doğrudan gol olmaz. 2026-27'den itibaren hakem taçta gecikmeyi fark ederse **5 saniyelik geri sayım** başlatır; süre aşılırsa taç rakibe geçer.",
        },
      ],
    },
    {
      id: 'kural-16',
      heading: 'Kural 16 – Kale Vuruşu',
      blocks: [
        {
          type: 'p',
          text: 'Top hareket ettiği anda oyundadır; ceza sahasından çıkması gerekmez. Geciktirilen kale vuruşunda da 5 saniye kuralı uygulanır; süre aşılırsa rakibe **korner** verilir.',
        },
      ],
    },
    {
      id: 'kural-17',
      heading: 'Kural 17 – Köşe Vuruşu',
      blocks: [
        {
          type: 'p',
          text: 'Top son olarak savunma oyuncusuna değip kale çizgisinden çıkarsa korner olur. Kornerden doğrudan gol atılabilir. Kalecinin topu elinde 8 saniyeden fazla tutması da artık rakibe korner kazandırır.',
        },
      ],
    },
  ],
  faq: [
    { q: 'Futbolda kaç kural vardır?', a: "IFAB'ın Oyun Kuralları kitabında 17 kural vardır." },
    {
      q: 'Futbol kurallarını kim belirler?',
      a: "IFAB (International Football Association Board). FIFA'nın 4, İngiltere, İskoçya, Galler ve Kuzey İrlanda federasyonlarının 1'er oyu vardır; değişiklik için 8 oyun 6'sı gerekir.",
    },
    { q: 'Yeni kurallar ne zaman yürürlüğe girer?', a: "Her yıl 1 Temmuz'da. Türkiye'de TFF uygulamayı sezon başında duyurur." },
  ],
};

export const RULE_ARTICLES: RuleArticle[] = [
  {
    slug: '2026-27-degisiklikler',
    title: "Futbolda Yeni Kurallar 2026-27: Süper Lig'de Neler Değişti?",
    heading: "2026-27 Sezonunda Futbolda Ne Değişti? Süper Lig'de Uygulanan Tüm Yeni Kurallar",
    description: "5 saniye kuralı, 10 saniyede oyundan çıkma, ağız kapatmaya sarı kart, VAR'ın yeni yetkileri. 2026-27 kural değişikliklerinin tamamı.",
    lead:
      "2026-27 sezonunda futbolda en büyük değişiklik **zaman geçirmeye karşı getirilen geri sayımlar** oldu: taç ve kale vuruşunda 5 saniye, oyundan çıkan oyuncu için 10 saniye kuralı. Ayrıca VAR'ın müdahale alanı genişledi ve rakibe konuşurken ağzını kapatan oyunculara kart verilmeye başlandı. IFAB'ın onayladığı bu kurallar 2026 Dünya Kupası'nda uygulandı; TFF 21 Temmuz 2026'da Trendyol Süper Lig'de de geçerli olacağını açıkladı.",
    badge: 'Güncel',
    updated: UPDATED,
    updatedIso: UPDATED_ISO,
    publishedIso: UPDATED_ISO,
    sections: [
      {
        id: 'ozet-tablo',
        heading: 'Özet tablo',
        blocks: [
          {
            type: 'table',
            head: ['Kural', 'Ne değişti?', 'Yaptırım'],
            rows: [
              ['Taç atışı (Kural 15)', 'Hakem gecikmeyi görürse 5 saniye geri sayar', 'Taç rakibe geçer'],
              ['Kale vuruşu (Kural 16)', 'Aynı 5 saniye geri sayımı', 'Rakibe korner'],
              ['Oyuncu değişikliği (Kural 3)', 'Çıkan oyuncu 10 saniyede sahayı terk etmeli', 'Giren oyuncu, oyun başladıktan sonraki ilk duraksamaya kadar en az 1 dakika bekler'],
              ['Sakatlık (Kural 5)', 'Oyunu durduran/sahada tedavi edilen oyuncu dışarı çıkar', 'Oyun başladıktan sonra 1 dakika dışarıda kalır (kaleci gibi istisnalar var)'],
              ['VAR (Kural 5-6)', 'Yanlış ikinci sarı, yanlış oyuncuya kart, (isteğe bağlı) hatalı korner', 'Karar düzeltilir'],
              ['Ağız kapatma', 'Rakiple konuşurken ağzı kapatmak cezalandırılır', "Süper Lig'de sarı kart; sonradan hakaret tespit edilirse disiplin cezası"],
              ['Hakem topu (Kural 8)', 'Top, kazanacak/elinde tutacak takıma verilir', '—'],
              ['Penaltı atışları (Kural 10)', 'Kazara çift vuruş: gol olursa tekrar, olmazsa kaçmış sayılır', '—'],
              ['Serinleme molası', 'Yalnız 32°C ve üzerinde', 'Her devrede en fazla 3 dk'],
            ],
          },
        ],
      },
      {
        id: '5-saniye-kurali',
        heading: '5 saniye kuralı nedir?',
        blocks: [
          {
            type: 'p',
            text: 'Bir oyuncu taç atışını veya kale vuruşunu bilerek geciktirirse hakem düdük çalar ve elini kaldırarak 5 saniyelik geri sayım başlatır. Süre dolduğunda top hâlâ oyuna girmemişse **taç rakip takıma geçer**, kale vuruşunda ise **rakibe korner** verilir. Bu, geçen sezon kalecilere getirilen 8 saniye kuralının mantığının sahadaki diğer duran toplara yayılmasıdır.',
          },
        ],
      },
      {
        id: '10-saniye-kurali',
        heading: 'Oyundan çıkan oyuncu 10 saniyede çıkmazsa ne olur?',
        blocks: [
          {
            type: 'p',
            text: 'Değişiklik tabelası kalktıktan sonra oyuncu 10 saniye içinde sahayı terk etmelidir (en yakın çizgiden çıkması beklenir). Güvenlik veya sakatlık gibi geçerli bir neden yoksa ve süre aşılırsa, yerine girecek oyuncu hemen giremez: oyun yeniden başladıktan sonra en az **1 dakika** geçmesi ve ilk duraksamanın gelmesi gerekir. Yani takım kısa süre 10 kişi oynar.',
          },
        ],
      },
      {
        id: 'var',
        heading: 'VAR artık neye bakabiliyor?',
        blocks: [
          {
            type: 'p',
            text: 'Klasik dört durum (gol, penaltı, direkt kırmızı kart, yanlış oyuncuya kart) korunuyor. Yeni eklenenler: açıkça hatalı verilmiş **ikinci sarı kart** sonucu çıkan kırmızı ve yarışmanın tercih etmesi durumunda açıkça hatalı **korner kararı**. TFF ayrıca duran toplarda top oyuna girmeden önce yapılan ve gol ya da penaltıyla sonuçlanan ihlallerin de incelenebileceğini açıkladı. Ayrıntı: [VAR hangi durumlarda müdahale eder?](/futbol-kurallari/var)',
          },
        ],
      },
      {
        id: 'agiz-kapatma',
        heading: 'Ağız kapatmak neden sarı kart?',
        blocks: [
          {
            type: 'p',
            text: "Amaç ırkçı ve ayrımcı ifadelerin gizlenmesini önlemek. IFAB, rakiple konuşurken provokatif şekilde ağzı kapatmayı yarışmaların cezalandırabileceği bir davranış olarak tanımladı. Süper Lig'de bu davranışa sarı kart gösteriliyor; maç sonrası görüntülerde hakaret tespit edilirse disiplin kurulu ayrıca ceza verebiliyor.",
          },
        ],
      },
      {
        id: 'diger',
        heading: 'Diğer değişiklikler',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Kart avantajı:** Gol şansını engelleyen bir faulde hakem avantaj verir ve gol olursa, faul yapan oyuncu artık sarı kart görmüyor.',
              '**Yeni zaman geçirme kartları:** Taç atıyormuş gibi yapıp topu arkadaşına vermek, değişiklikte oyalanmak, düdükten sonra topu atmak/tutmak ve serbest vuruşu bilerek yanlış yerden kullanmak sarı kart sebebi.',
              '**Hakem vücut kamerası** ve **yarı otomatik ofsayt** teknolojisi kurallarda resmen tanımlandı.',
              "**Yalnız kaptan hakeme gidebilir** uygulaması 1 Temmuz 2027'den itibaren tüm yarışmalarda zorunlu olacak.",
            ],
          },
          { type: 'p', text: 'Bu sezon hangi hakemin kaç kart gösterdiğini [hakem istatistikleri](/hakemler) sayfasında maç maç izleyebilirsiniz.' },
        ],
      },
    ],
    faq: [
      { q: "Yeni kurallar Süper Lig'de ne zaman başladı?", a: '2026-27 sezonunun başından itibaren; TFF açıklaması 21 Temmuz 2026 tarihlidir.' },
      { q: '5 saniye kuralı kornerde de var mı?', a: 'Hayır. Geri sayım taç atışı ve kale vuruşu için tanımlandı. Kaleci için ise 8 saniye kuralı geçerli.' },
      { q: 'Ağız kapatan oyuncu kırmızı kart görür mü?', a: "IFAB yarışmalara ağır yaptırım seçeneği tanıyor; Süper Lig'de TFF sarı kart uygulamasını açıkladı." },
    ],
  },
  {
    slug: 'ilginc-kurallar',
    title: 'Futbolun En İlginç 15 Kuralı: Taçtan Gol Olur mu?',
    heading: 'Futbolun En İlginç 15 Kuralı (Çoğu Taraftar Bilmiyor)',
    description: 'Taçtan gol olur mu, top hakeme çarparsa ne olur, kaç oyuncuyla maç biter? Futbolun az bilinen 15 kuralı.',
    lead:
      "Futbolun 17 kuralını herkes bildiğini düşünür, ama bazı ayrıntılar en deneyimli taraftarı bile şaşırtır. Taçtan doğrudan gol olmaz, ama santradan olur. Kendi kalenize serbest vuruştan doğrudan gol atamazsınız. Bir takım 7 kişinin altına düşerse maç biter. İşte IFAB Oyun Kuralları'ndan en ilginç 15 madde.",
    badge: 'İlginç',
    updated: UPDATED,
    updatedIso: UPDATED_ISO,
    publishedIso: UPDATED_ISO,
    sections: [
      { id: 'tactan-gol', heading: '1. Taçtan direkt gol olmaz', blocks: [{ type: 'p', text: 'Taç atışı doğrudan rakip kaleye girerse gol sayılmaz, kale vuruşu verilir. Kendi kalesine giderse rakibe korner verilir.' }] },
      { id: 'santradan-gol', heading: '2. Santradan direkt gol olur', blocks: [{ type: 'p', text: "1997'den beri santradan doğrudan rakip kaleye atılan şut gol sayılıyor. Uzak mesafeden kaleciyi yakalayan santra golleri bu yüzden geçerli." }] },
      { id: 'kale-vurusundan-gol', heading: '3. Kale vuruşundan da gol olur', blocks: [{ type: 'p', text: 'Kaleci kale vuruşunu doğrudan rakip kaleye sokarsa gol geçerlidir. Kaleden kaleye goller bu kural sayesinde mümkün.' }] },
      { id: 'kendi-kalesine-serbest-vurus', heading: '4. Kendi kalenize serbest vuruştan gol atamazsınız', blocks: [{ type: 'p', text: 'Direkt ya da endirekt serbest vuruş doğrudan kendi kalenize girerse gol olmaz; rakibe korner verilir.' }] },
      { id: 'en-az-7-oyuncu', heading: '5. 7 kişinin altına düşen takım oynayamaz', blocks: [{ type: 'p', text: "Kırmızı kartlar veya sakatlıklar yüzünden bir takımda 7'den az oyuncu kalırsa hakem maçı devam ettirmez. Sonuç yarışma kurallarına göre belirlenir (genellikle hükmen yenilgi)." }] },
      { id: 'duran-topta-ofsayt', heading: '6. Taç, korner ve kale vuruşundan ofsayt olmaz', blocks: [{ type: 'p', text: 'Topu bu üç durumdan alan oyuncu, rakiplerin önünde bile olsa ofsayt değildir. Ayrıntı: [Ofsayt kuralı](/futbol-kurallari/ofsayt).' }] },
      { id: 'kendi-yari-sahasinda-ofsayt', heading: '7. Kendi yarı sahanızda ofsayt olmaz', blocks: [{ type: 'p', text: 'Pas anında kendi yarı sahasında duran oyuncu, ne kadar önde olursa olsun ofsayt sayılmaz.' }] },
      { id: 'top-hakeme-carparsa', heading: '8. Top hakeme çarpınca oyun durabilir', blocks: [{ type: 'p', text: 'Top hakeme değip gole gidiyorsa, topun sahibi değişiyorsa ya da tehlikeli bir atak başlıyorsa oyun durdurulur ve hakem topuyla yeniden başlar.' }] },
      { id: 'geri-pas', heading: '9. Kaleci geri pası eliyle alamaz', blocks: [{ type: 'p', text: "1992'de getirilen geri pas kuralına göre takım arkadaşının ayakla bilerek verdiği pası veya tacını kaleci eliyle tutamaz. Ceza: endirekt serbest vuruş." }] },
      { id: 'kaleci-8-saniye', heading: '10. Kaleci topu 8 saniyeden fazla tutarsa korner', blocks: [{ type: 'p', text: 'Eskiden endirekt serbest vuruş olan bu ihlalin cezası artık rakibe korner. Hakem son 5 saniyeyi eliyle sayar. Tüm kaleci kuralları: [Kaleci kuralları](/futbol-kurallari/kaleci-kurallari).' }] },
      { id: 'top-cizgide', heading: '11. Top çizgiye değiyorsa hâlâ oyunda', blocks: [{ type: 'p', text: 'Topun tamamı çizgiyi geçmedikçe top oyundadır. Gol için de aynısı geçerli: topun tamamı çizgiyi geçmelidir.' }] },
      { id: 'yedek-kart', heading: '12. Yedekler ve teknik heyet de kart görür', blocks: [{ type: 'p', text: "Yedek oyuncular kırmızı kart görüp kulübeden çıkarılabilir; antrenörler de 2019'dan beri sarı ve kırmızı kart görüyor." }] },
      { id: 'sure-dolsa-da-penalti', heading: '13. Penaltıda süre dolsa da vuruş tamamlanır', blocks: [{ type: 'p', text: 'Devre sonunda verilen penaltı, süre bitmiş olsa bile kullanılır ve vuruş sonuçlanana kadar devre bitmez.' }] },
      { id: 'baraj-1-metre', heading: '14. Baraja 1 metreden fazla yaklaşamazsınız', blocks: [{ type: 'p', text: "Savunma 3 veya daha fazla kişilik baraj kurduğunda, hücum oyuncuları barajdan en az 1 metre uzakta durmalı. Bu kural 2019'da baraj içi itişmeleri bitirmek için geldi." }] },
      { id: 'penalti-cift-vurus', heading: '15. Penaltıda çift vuruş: gol olursa tekrar', blocks: [{ type: 'p', text: 'Penaltı atışlarında atıcı topa kazara iki ayağıyla dokunursa ya da top destek bacağına değerse, gol olduysa vuruş tekrarlanır; gol olmadıysa kaçmış sayılır.' }] },
    ],
    faq: [
      { q: 'Taçtan gol olur mu?', a: 'Hayır. Taçtan doğrudan atılan top gol sayılmaz; başka bir oyuncuya değmesi gerekir.' },
      { q: 'Bir takım en az kaç oyuncuyla oynayabilir?', a: '7. Daha azına düşerse maç devam etmez.' },
      { q: 'Kaleci gol atabilir mi?', a: 'Evet. Kaleci hem oyun içinde hem de kale vuruşundan doğrudan gol atabilir.' },
    ],
  },
  {
    slug: 'var',
    title: 'VAR Hangi Durumlarda Müdahale Eder? (2026-27)',
    heading: 'VAR Hangi Durumlarda Müdahale Eder? 2026-27 Güncel Rehber',
    description: "VAR'ın inceleyebildiği tüm durumlar, yeni eklenen ikinci sarı kart ve korner incelemesi, ofsayt teknolojisi ve sık sorulan sorular.",
    lead:
      '**VAR (Video Yardımcı Hakem)**, yalnızca "açık ve net hata" veya "gözden kaçan ciddi olay" olduğunda devreye girer. 2026-27 sezonundan önce VAR dört durumda müdahale edebiliyordu: gol, penaltı, direkt kırmızı kart ve yanlış oyuncuya kart. Yeni sezonda bu listeye **hatalı ikinci sarı kart** ve isteğe bağlı olarak **hatalı korner kararı** eklendi.',
    badge: 'Güncel',
    updated: UPDATED,
    updatedIso: UPDATED_ISO,
    publishedIso: UPDATED_ISO,
    sections: [
      {
        id: 'durumlar',
        heading: "VAR'ın inceleyebildiği durumlar",
        blocks: [
          {
            type: 'table',
            head: ['Durum', 'Ne kontrol edilir?', 'Yeni mi?'],
            rows: [
              ['Gol / gol değil', 'Ofsayt, faul, elle oynama, topun dışarı çıkması atak sırasında', 'Hayır'],
              ['Penaltı / penaltı değil', 'Faulün yeri ve olup olmadığı', 'Hayır'],
              ['Direkt kırmızı kart', 'Ciddi faul, şiddet, gol şansını engelleme', 'Hayır'],
              ['Yanlış oyuncuya kart', 'Kimlik karışıklığı', 'Hayır'],
              ['İkinci sarı kart', 'Açıkça hatalı ikinci sarı sonucu kırmızı', '**Evet**'],
              ['Korner kararı', 'Açıkça hatalı verilmiş korner (yarışma tercihi)', '**Evet**'],
            ],
          },
        ],
      },
      {
        id: 'var-neye-bakamaz',
        heading: 'VAR neye bakamaz?',
        blocks: [
          {
            type: 'p',
            text: 'Tek sarı kartlar (ikinci sarı hariç), normal taç atışları, kenarda kalan basit fauller ve "tartışmalı ama açık hata değil" kararlar VAR\'ın alanı dışındadır. VAR, hakemin yerine karar vermez; hakemi monitöre çağırır ya da olgusal durumları (ofsayt çizgisi gibi) doğrudan bildirir.',
          },
        ],
      },
      {
        id: 'yari-otomatik-ofsayt',
        heading: 'Yarı otomatik ofsayt nedir?',
        blocks: [
          {
            type: 'p',
            text: "Kameralar ve topun içindeki sensörle oyuncuların pozisyonunu takip eden sistem, ofsayt bilgisini birkaç saniyede VAR'a iletir. Gelişmiş sürümde bilgi doğrudan yardımcı hakeme gider. 2026-27 kurallarıyla bu teknoloji Oyun Kuralları'nda resmen tanımlandı. Ofsaytın kendisi: [Ofsayt kuralı nedir?](/futbol-kurallari/ofsayt)",
          },
        ],
      },
      {
        id: 'vucut-kamerasi',
        heading: 'Hakem vücut kamerası',
        blocks: [
          {
            type: 'p',
            text: "Yarışmalar artık hakem, yardımcı hakem ve dördüncü hakemlere vücut kamerası taktırabilir. Görüntüler organizatöre aittir; VAR konuşmalarının mikrofonla yayınlanmasına ise izin verilmez.",
          },
        ],
      },
      {
        id: 'hakemler',
        heading: 'Süper Lig hakemleri',
        blocks: [
          {
            type: 'p',
            text: 'Süper Lig ve 1. Lig hakemlerinin yönettiği maçlar, kart ve penaltı ortalamaları: [Hakem istatistikleri](/hakemler).',
          },
        ],
      },
    ],
    faq: [
      { q: 'VAR sarı karta bakar mı?', a: "Tek sarı karta bakmaz. Ancak 2026-27'den itibaren kırmızıyla sonuçlanan açıkça hatalı ikinci sarıyı inceleyebilir." },
      { q: 'VAR kornere bakabilir mi?', a: 'Yarışma isterse, açıkça hatalı korner kararını oyunu geciktirmeden düzeltebilir.' },
      { q: "VAR'da son kararı kim verir?", a: 'Her zaman sahadaki hakem.' },
    ],
  },
  {
    slug: 'uzatma',
    title: 'Uzatma Dakikaları Nasıl Hesaplanır? (Kural 7)',
    heading: 'Uzatma Dakikaları Nasıl Hesaplanır?',
    description: 'Uzatmaya neler eklenir, dördüncü hakemin tabelası ne demek, devre sonunda penaltı ve uzatma devreleri nasıl işler? Kural 7 kısa rehberi.',
    lead:
      "Maç 45'er dakikalık iki devreden oluşur. **Uzatma (ek süre)**, devre içinde kaybedilen zamanın devre sonuna eklenmesidir: oyuncu değişiklikleri, sakatlık müdahaleleri, zaman geçirme, VAR incelemeleri ve gol sevinçleri gibi duraklamalar sayılır. Dördüncü hakemin gösterdiği süre **en az** oynanacak süredir; hakem gerekirse daha fazla oynatır.",
    badge: 'Rehber',
    updated: UPDATED,
    updatedIso: UPDATED_ISO,
    publishedIso: UPDATED_ISO,
    sections: [
      {
        id: 'neler-eklenir',
        heading: 'Uzatmaya neler eklenir?',
        blocks: [
          {
            type: 'ul',
            items: [
              'Oyuncu değişiklikleri',
              'Sakat oyuncunun kontrolü ve sahadan çıkarılması',
              'Zaman geçirme',
              'Kart gösterme gibi disiplin işlemleri',
              'Yarışma kurallarının izin verdiği su ve serinleme molaları',
              '[VAR](/futbol-kurallari/var) kontrolleri ve incelemeleri',
              'Gol sevinçleri',
              'Seyirci kaynaklı duraklamalar gibi diğer kayıplar',
            ],
          },
        ],
      },
      {
        id: 'tabela',
        heading: 'Dördüncü hakemin tabelası',
        blocks: [
          {
            type: 'p',
            text: 'Devrenin son dakikasında dördüncü hakem, hakemin belirlediği **en az** ek süreyi tabelayla gösterir. Uzatmada yeniden zaman kaybedilirse süre artırılabilir, ama gösterilen süre kısaltılamaz. Bir devrede kullanılmayan süre sonraki devreye devredilmez.',
          },
        ],
      },
      {
        id: 'devre-sonunda-penalti',
        heading: 'Süre biterken penaltı',
        blocks: [
          {
            type: 'p',
            text: 'Süre dolduğu anda verilmiş ya da tekrarlanacak bir penaltı varsa devre, penaltı tamamlanana kadar uzatılır. Atış sonuçlandığında (gol, kurtarış ya da top dışarı) devre biter; dönen topa yeniden vuruş yapılamaz.',
          },
        ],
      },
      {
        id: 'uzatma-devreleri',
        heading: 'Uzatma devreleri ve seri penaltılar',
        blocks: [
          {
            type: 'p',
            text: "Eleme maçlarında eşitlik bozulmazsa, yarışma kurallarına göre **en fazla 15'er dakikalık iki uzatma devresi** oynanır; uzatma devrelerinde de kaybedilen zaman eklenir. Eşitlik yine sürerse kazanan seri penaltı atışlarıyla belirlenir.",
          },
        ],
      },
    ],
    faq: [
      { q: 'Uzatma süresi kısaltılabilir mi?', a: 'Hayır. Dördüncü hakemin gösterdiği süre en az süredir; hakem gerektiğinde uzatır ama kısaltamaz.' },
      { q: 'İlk yarıdan artan süre ikinci yarıya eklenir mi?', a: 'Hayır. Her devrenin kaybedilen zamanı kendi sonuna eklenir; bir devrede kullanılmayan süre devredilmez.' },
      { q: 'Devre arası kaç dakika?', a: 'Kurallara göre en fazla 15 dakika; süreyi yarışma kuralları belirler, hakemin izniyle değişebilir.' },
      { q: 'Uzatma devresinde atılan gol maçı bitirir mi?', a: 'Hayır. Altın gol uygulaması yok; uzatma devreleri sonuna kadar oynanır.' },
      { q: 'Seri penaltı golleri maç skoruna eklenir mi?', a: 'Hayır. Seri penaltılar yalnız kazananı belirler; maç skoru uzatmaların sonundaki skor olarak kalır.' },
    ],
  },
  {
    slug: 'penalti',
    title: 'Penaltı Kuralları: Kaleci, Atıcı ve Tekrar (Kural 14)',
    heading: 'Penaltı Kuralları: Kim Nerede Durur, Ne Zaman Tekrar Edilir?',
    description: 'Penaltıda kaleci çizgide mi durmalı, atıcı aldatabilir mi, ceza sahasına erken giren olursa ne olur? Kural 14 ve seri penaltı rehberi.',
    lead:
      "**Penaltı**, bir takım kendi ceza sahası içinde direkt serbest vuruşluk bir ihlal yaptığında (ör. faul, elle oynama) rakibe verilir. Top, kale çizgisinden **11 metre** uzaktaki penaltı noktasından atılır. Kaleci vuruş anında kale çizgisinde olmalıdır; atıcı ve kaleci dışındaki herkes ceza sahası ile yayın dışında, penaltı noktasının gerisinde durur.",
    badge: 'Rehber',
    updated: '23 Kasım 2026',
    updatedIso: '2026-11-23',
    publishedIso: '2026-11-23',
    sections: [
      {
        id: 'kim-nerede',
        heading: 'Penaltıda kim nerede durur?',
        blocks: [
          { type: 'pitchDiagram' },
          {
            type: 'ul',
            items: [
              '**Top:** Penaltı noktasında ve duruyor olmalı; kale direkleri, üst direk ve ağlar hareketsiz olmalıdır.',
              '**Atıcı:** Hakem tarafından açıkça belirlenir. Topu ileriye doğru vurmalıdır (topuk vuruşu ileri giderse geçerlidir).',
              '**Kaleci:** Direkler arasında, atıcıya dönük, kale çizgisinde durur. Vuruş anında en az bir ayağının bir kısmı kale çizgisine değmeli ya da çizginin hizasında olmalıdır; direklere, ağlara dokunamaz.',
              "**Diğer oyuncular:** Ceza sahasının ve yayın dışında, penaltı noktasının gerisinde. Yay, penaltı noktasına **9,15 metre** mesafeyi gösterir.",
            ],
          },
        ],
      },
      {
        id: 'aldatma',
        heading: 'Atıcı aldatabilir mi?',
        blocks: [
          {
            type: 'p',
            text: 'Koşu sırasında duraksamak, tempo değiştirmek ve vücutla aldatmak serbesttir. Ama koşu bittikten sonra vuracakmış gibi yapıp vurmamak ihlaldir: atıcı **sarı kart** görür ve rakibe **endirekt serbest vuruş** verilir. Panenka gibi yavaş vuruşlar ise tamamen kurala uygundur; önemli olan topun ileri gitmesi.',
          },
        ],
      },
      {
        id: 'tekrar',
        heading: 'Penaltı ne zaman tekrar edilir?',
        blocks: [
          {
            type: 'table',
            head: ['İhlal', 'Gol olursa', 'Gol olmazsa'],
            rows: [
              ['Kaleci çizgiden erken çıktı', 'Gol geçerli', 'Kurtarırsa tekrar; top dışarı ya da direğe giderse yalnız atıcıyı açıkça etkilediyse tekrar'],
              ['Atıcının takım arkadaşı ceza sahasına erken girdi*', 'Penaltı tekrar edilir; erken giren dönen topu kendisi gole çevirdiyse gol iptal, rakibe endirekt serbest vuruş', 'Rakibe endirekt serbest vuruş'],
              ['Savunma oyuncusu ceza sahasına erken girdi*', 'Gol geçerli', 'Penaltı tekrar edilir'],
              ['İki takımdan da oyuncu ihlal yaptı', 'Penaltı tekrar edilir', 'Penaltı tekrar edilir'],
              ['Atıcı koşu bitince aldattı', 'Gol iptal, atıcıya sarı kart, rakibe endirekt serbest vuruş', 'Atıcıya sarı kart, rakibe endirekt serbest vuruş'],
            ],
          },
          {
            type: 'p',
            text: '*Erken giriş yalnız **etkisi varsa** cezalandırılır: hücumcu kaleciyi açıkça etkilediyse ya da topa oynayıp gol attıysa / şans yarattıysa; savunmacı atıcıyı açıkça etkilediyse ya da topa oynayıp golü engellediyse. Kaleci ihlali yüzünden penaltı tekrar edilirse kaleci maçtaki ilk ihlalinde uyarılır, sonraki ihlallerinde **sarı kart** görür.',
          },
        ],
      },
      {
        id: 'sonrasi',
        heading: 'Penaltıdan sonra top kimde?',
        blocks: [
          {
            type: 'p',
            text: "Top kaleciden veya direkten dönerse oyun devam eder; herkes topa oynayabilir. Tek istisna atıcıdır: top başka bir oyuncuya değmeden atıcı topa **bilerek ikinci kez dokunamaz**, dokunursa rakibe endirekt serbest vuruş verilir. Vuruş anında kazara çift dokunuşta (iki ayakla ya da destek ayağıyla) gol olursa penaltı tekrar edilir, olmazsa rakibe endirekt serbest vuruş verilir (IFAB, Haziran 2025). Penaltı devre bitimine denk gelirse devre, atış tamamlanana kadar uzatılır; bu durumda dönen topa yeniden vurulamaz ([uzatma dakikaları](/futbol-kurallari/uzatma)).",
          },
        ],
      },
      {
        id: 'seri-penalti',
        heading: 'Seri penaltı atışları nasıl işler? (Kural 10)',
        blocks: [
          {
            type: 'ol',
            items: [
              'Hakem atışların yapılacağı kaleyi ve yazı-turayla ilk atacak takımı belirler.',
              'Yalnız maçın sonunda sahada olan oyuncular atış yapabilir; her oyuncu ikinci kez atmadan önce takımın uygun bütün oyuncuları birer kez atmış olmalıdır.',
              'Takımlar sırayla beşer atış yapar. Bir takım kalan atışlarla yetişemeyecek duruma düşerse seri biter.',
              'Beş atışta eşitlik sürerse ani ölüm başlar: aynı sayıda atışta biri atıp diğeri kaçırana kadar devam edilir.',
              'Seri penaltı golleri maç skoruna eklenmez; yalnız kazananı belirler.',
            ],
          },
          {
            type: 'p',
            text: "Seri penaltıda atıcının kazara topa iki kez dokunması: gol olursa atış tekrarlanır, olmazsa kaçmış sayılır. Kural Haziran 2025'te IFAB genelgesiyle getirildi, 2026-27 kitabında netleştirildi ([2026-27 değişiklikleri](/futbol-kurallari/2026-27-degisiklikler)).",
          },
        ],
      },
    ],
    faq: [
      { q: 'Penaltı noktası kaleye kaç metre?', a: 'Kale çizgisinden 11 metre (12 yarda).' },
      { q: 'Kaleci penaltıda öne çıkabilir mi?', a: 'Hayır. Vuruş anında en az bir ayağının bir kısmı kale çizgisine değmeli ya da çizginin hizasında olmalıdır. Çıkarsa ve gol olmazsa penaltı tekrar edilir.' },
      { q: 'Penaltı arkadaşa pas verilerek kullanılabilir mi?', a: 'Evet. Top ileri gittiği sürece atıcı pas verebilir; ancak takım arkadaşı pas anında ceza sahasının dışında, penaltı noktasının gerisinde olmalıdır.' },
      { q: 'Panenka kurala uygun mu?', a: 'Evet. Koşu bittikten sonra vuracakmış gibi yapıp durmak yasak; yavaş ve aşırtma vuruş serbesttir.' },
      { q: 'Penaltıdan direkt gol olur mu?', a: 'Evet. Penaltı, direkt gol atılabilen bir vuruştur.' },
    ],
  },
  {
    slug: 'saha-olculeri',
    title: 'Futbol Sahası Ölçüleri: Her Saha Aynı mı? (Kural 1)',
    heading: 'Futbol Sahası Ölçüleri: Her Saha Aynı Boyutta mı?',
    description: 'Futbol sahası kaç metre? Uzunluk ve genişlik aralıkları, ceza sahası, kale, penaltı noktası ve orta yuvarlak ölçüleri tek tabloda.',
    lead:
      "Hayır, **her futbol sahası aynı boyutta değildir.** Kurallar bir aralık verir: uluslararası maçlarda uzunluk **100–110 m**, genişlik **64–75 m** olabilir. Buna karşılık sahanın içindeki çizgiler sabittir: ceza sahası 16,5 m, penaltı noktası 11 m, kale 7,32 × 2,44 m her sahada aynıdır. Büyük turnuvalarda ve Avrupa maçlarında en yaygın ölçü **105 × 68 m**'dir.",
    badge: 'Rehber',
    updated: '23 Kasım 2026',
    updatedIso: '2026-11-23',
    publishedIso: '2026-11-23',
    sections: [
      {
        id: 'boyutlar',
        heading: 'Futbol sahası kaç metre?',
        blocks: [
          {
            type: 'table',
            head: ['Ölçü', 'Genel kural', 'Uluslararası maç'],
            rows: [
              ['Uzunluk (yan çizgi)', '90–120 m', '100–110 m'],
              ['Genişlik (kale çizgisi)', '45–90 m', '64–75 m'],
            ],
          },
          {
            type: 'p',
            text: 'Yan çizgi her zaman kale çizgisinden uzun olmalıdır. Kurallar en az ve en çok değeri verdiği için iki stadyum arasında birkaç metre fark olabilir; ev sahibi takımlar da oyun tarzına göre izin verilen aralıkta dar ya da geniş saha seçebilir.',
          },
        ],
      },
      {
        id: 'sabit-olculer',
        heading: 'Hangi ölçüler her sahada aynıdır?',
        blocks: [
          { type: 'pitchDiagram' },
          {
            type: 'table',
            head: ['Alan', 'Ölçü'],
            rows: [
              ['Kale', '7,32 m genişlik × 2,44 m yükseklik'],
              ['Kale sahası', 'Direklerden 5,5 m dışarı, sahaya 5,5 m içeri'],
              ['Ceza sahası', 'Direklerden 16,5 m dışarı, sahaya 16,5 m içeri (40,32 m genişlik)'],
              ['Penaltı noktası', 'Kale çizgisinden 11 m'],
              ['Ceza sahası yayı', 'Penaltı noktasından 9,15 m yarıçap'],
              ['Orta yuvarlak', '9,15 m yarıçap'],
              ['Korner yayı', '1 m yarıçap'],
              ['Çizgi kalınlığı', 'En fazla 12 cm; bütün çizgiler aynı kalınlıkta'],
              ['Korner bayrağı', 'En az 1,5 m yükseklik'],
            ],
          },
        ],
      },
      {
        id: 'neden-9-15',
        heading: '9,15 metre nereden geliyor?',
        blocks: [
          {
            type: 'p',
            text: "Kurallar İngiltere'de yarda ile yazıldı: 9,15 m aslında **10 yarda**, 11 m 12 yarda, 16,5 m ise 18 yardadır. Serbest vuruşta barajın uzaklığı, başlama vuruşunda rakibin uzaklığı ve penaltıda oyuncuların uzaklığı hep aynı 9,15 metredir; orta yuvarlak ile ceza sahası yayı bu mesafeyi sahada gösterir.",
          },
        ],
      },
      {
        id: 'zemin',
        heading: 'Zemin ve çizgiler',
        blocks: [
          {
            type: 'p',
            text: 'Saha tamamen doğal ya da yarışma kuralları izin veriyorsa tamamen yapay çim olabilir; renk yeşil olmalıdır. Çizgiler bulundukları alana dahildir: top çizginin üstündeyken hâlâ sahadadır, top **tamamen** çizgiyi geçince oyun dışı olur. Bu yüzden gol için de topun tamamının kale çizgisini geçmesi gerekir.',
          },
        ],
      },
    ],
    faq: [
      { q: 'Standart futbol sahası kaç metre?', a: "Kesin tek bir ölçü yok; uluslararası maçlarda 100–110 × 64–75 m aralığı geçerli. En yaygın ölçü 105 × 68 m'dir." },
      { q: 'Ceza sahası kaç metre?', a: 'Kale direklerinden 16,5 m dışarı ve sahaya 16,5 m içeri; toplam genişliği 40,32 m.' },
      { q: 'Kale kaç metre?', a: 'Direklerin iç kenarları arası 7,32 m, üst direğin alt kenarı yerden 2,44 m.' },
      { q: 'Top çizgideyse dışarı mı?', a: 'Hayır. Topun tamamı çizgiyi geçmedikçe top oyundadır.' },
    ],
  },
  {
    slug: 'kaleci-kurallari',
    title: 'Kaleci Kuralları: 8 Saniye, Geri Pas ve Kaleci Golü',
    heading: 'Kaleci Kuralları: Elle Oynama, 8 Saniye, Geri Pas',
    description: 'Kaleci topu kaç saniye tutabilir, geri pası neden elle alamaz, kaleci gol atabilir mi? Kalecilere özel kuralların kısa rehberi.',
    lead:
      "Kaleci, topu **yalnız kendi ceza sahası içinde** elle oynayabilen tek oyuncudur. Bu ayrıcalığın sınırları vardır: topu elinde en fazla **8 saniye** tutabilir, takım arkadaşının ayakla bilerek verdiği pası ve doğrudan taçtan gelen topu elle alamaz. Ceza sahası dışında ise diğer oyuncularla aynı kurallara tabidir.",
    badge: 'Rehber',
    updated: '23 Kasım 2026',
    updatedIso: '2026-11-23',
    publishedIso: '2026-11-23',
    sections: [
      {
        id: '8-saniye',
        heading: 'Kaleci topu kaç saniye tutabilir?',
        blocks: [
          {
            type: 'p',
            text: "Kaleci topu eline aldıktan sonra en fazla **8 saniye** içinde bırakmalıdır. Hakem son 5 saniyeyi elini kaldırarak sayar; süre aşılırsa rakip takıma **korner** verilir. Bu kural 2025-26'da eski endirekt serbest vuruş cezasının yerine geldi ve taç ile kale vuruşundaki [5 saniye kuralına](/futbol-kurallari/2026-27-degisiklikler) örnek oldu.",
          },
        ],
      },
      {
        id: 'geri-pas',
        heading: 'Geri pası neden elle alamaz?',
        blocks: [
          {
            type: 'p',
            text: "Takım arkadaşı topu **ayakla bilerek** kaleciye verirse ya da kaleci topu doğrudan taç atışından alırsa, kaleci topu elle oynayamaz. Oynarsa rakibe ihlalin olduğu yerden **endirekt serbest vuruş** verilir (kale sahası içindeyse kale sahası çizgisinden). Kafa, göğüs veya dizle yapılan geri paslar elle alınabilir; ama bu kuralı aşmak için kasıtlı hileye (topu ayakla kafaya kaldırmak gibi) başvuran oyuncu sarı kart görür.",
          },
        ],
      },
      {
        id: 'ceza-sahasi-disi',
        heading: 'Ceza sahası dışında kaleci',
        blocks: [
          {
            type: 'ul',
            items: [
              'Ceza sahası dışında topa elle dokunan kaleci, diğer oyuncular gibi **direkt serbest vuruş** ile cezalandırılır; bir gol şansını engellediyse kırmızı kart görebilir.',
              'Kaleci ceza sahası içinden topu eliyle atıp doğrudan rakip kaleye sokarsa gol olmaz; oyun **kale vuruşuyla** başlar.',
              'Kaleci, topu elinden bıraktıktan sonra başka bir oyuncu dokunmadan tekrar elle alamaz.',
            ],
          },
        ],
      },
      {
        id: 'kaleci-golu',
        heading: 'Kaleci gol atabilir mi?',
        blocks: [
          {
            type: 'p',
            text: "Evet. Kaleci ayakla attığı her vuruşla gol atabilir: kale vuruşundan rakip kaleye giden uzun top, penaltı ya da serbest vuruş. Brezilyalı **Rogério Ceni**, São Paulo formasıyla attığı **131 resmî golle** en çok gol atan kaleci rekorunu (Guinness) elinde tutuyor; gollerinin 69'u penaltıdan, 61–62'si serbest vuruştan (kaynaklar bir gol farklı sayıyor). Kaleci kendi ceza sahasından eliyle attığı topla ise gol atamaz.",
          },
        ],
      },
      {
        id: 'degisiklik-penalti',
        heading: 'Kaleci değişikliği ve penaltıda kaleci',
        blocks: [
          {
            type: 'p',
            text: 'Kaleci, hakeme haber vererek oyun durduğunda takım arkadaşıyla yer değiştirebilir. Penaltıda kaleci kale çizgisinde durmak zorundadır; ayrıntılar [penaltı kuralları](/futbol-kurallari/penalti) sayfasında. Sakatlık nedeniyle sahada tedavi edilen kaleci, diğer oyunculardan farklı olarak sahadan çıkmak zorunda değildir.',
          },
        ],
      },
    ],
    faq: [
      { q: 'Kaleci topu 8 saniyeden fazla tutarsa ne olur?', a: 'Rakip takıma korner verilir. Hakem son 5 saniyeyi elini kaldırarak sayar.' },
      { q: 'Kaleci geri pası elle alırsa ne olur?', a: 'Rakibe endirekt serbest vuruş verilir. Kural yalnız ayakla bilerek yapılan paslar ve doğrudan taçtan gelen toplar için geçerlidir.' },
      { q: 'Kaleci elle attığı topla gol atabilir mi?', a: 'Hayır. Top rakip kaleye doğrudan girerse oyun kale vuruşuyla başlar.' },
      { q: 'En çok gol atan kaleci kim?', a: 'Rogério Ceni: São Paulo formasıyla 131 resmî gol (Guinness rekoru); 69 penaltı, 61–62 serbest vuruş.' },
    ],
  },
  {
    slug: 'ofsayt',
    title: 'Ofsayt Nedir? Ofsayt Kuralı Örneklerle Basit Anlatım',
    heading: 'Ofsayt Kuralı Nedir? Örneklerle Basit Anlatım',
    description: 'Ofsayt kuralı 3 adımda: pozisyon, an ve müdahale. Ne zaman ofsayt olur, ne zaman olmaz? Örnekler ve sık sorulan sorular.',
    lead:
      '**Ofsayt**, hücum oyuncusunun pas verildiği anda rakip yarı sahada, hem toptan hem de sondan ikinci rakip oyuncudan (genellikle son defans oyuncusu, çünkü kaleci de sayılır) rakip kaleye daha yakın olması ve oyuna müdahale etmesidir. Cezası, ihlalin olduğu yerden rakibe verilen endirekt serbest vuruştur.',
    badge: 'Rehber',
    updated: UPDATED,
    updatedIso: UPDATED_ISO,
    publishedIso: UPDATED_ISO,
    sections: [
      {
        id: '3-adimda-ofsayt',
        heading: '3 adımda ofsayt',
        blocks: [
          { type: 'offsideDiagram' },
          {
            type: 'ol',
            items: [
              '**Pozisyon:** Oyuncu rakip yarı sahada mı, ve kafası, gövdesi veya ayağı sondan ikinci rakipten ve toptan kaleye daha mı yakın? (Kollar ve eller hesaba katılmaz.)',
              '**An:** Bu durum, takım arkadaşının topa dokunduğu anda mı var? Sonradan öne geçmek önemli değil.',
              '**Müdahale:** Oyuncu topa oynuyor, rakibin görüşünü engelliyor ya da pozisyondan avantaj sağlıyor mu? Ofsayt pozisyonunda olup oyuna karışmayan oyuncu cezalandırılmaz.',
            ],
          },
        ],
      },
      {
        id: 'ofsayt-olmaz',
        heading: 'Ne zaman ofsayt olmaz?',
        blocks: [
          {
            type: 'ul',
            items: [
              'Oyuncu kendi yarı sahasındaysa',
              'Sondan ikinci rakiple veya son iki rakiple aynı hizadaysa',
              'Topu taç, korner veya kale vuruşundan alıyorsa',
              'Top rakip oyuncunun **bilinçli oynaması** sonucu kendisine geldiyse (kurtarış hariç)',
            ],
          },
        ],
      },
      {
        id: 'ornekler',
        heading: 'Örnekler',
        blocks: [
          { type: 'p', text: '**Örnek 1:** Forvet, pas anında son defansın yarım adım önünde. Topu alıp gol atıyor. → **Ofsayt**, gol iptal.' },
          {
            type: 'p',
            text: '**Örnek 2:** Forvet ofsayt pozisyonunda ama topa gitmiyor; topu arkadan gelen orta saha alıp gol atıyor. Forvet kalecinin görüşünü de kapatmıyor. → **Ofsayt değil**, gol geçerli.',
          },
          {
            type: 'p',
            text: '**Örnek 3:** Defans oyuncusu topu bilerek geri pas vermeye çalışıyor, top ofsayt pozisyonundaki forvete düşüyor. → **Ofsayt değil**, çünkü top rakibin bilinçli oynamasından geldi.',
          },
        ],
      },
      {
        id: 'teknoloji',
        heading: 'Teknoloji ve ofsayt',
        blocks: [
          {
            type: 'p',
            text: "Süper Lig ve büyük liglerde ofsayt kararları VAR çizgileriyle, birçok turnuvada da yarı otomatik ofsayt teknolojisiyle kontrol ediliyor ([VAR rehberi](/futbol-kurallari/var)). IFAB, ofsaytı hücumcu lehine değiştirmeyi (oyuncu vücudunun tamamı önde değilse ofsayt sayılmaması gibi) uzun süredir tartışıyor; bu fikir 2026-27 kural kitabında yer almıyor.",
          },
        ],
      },
    ],
    faq: [
      { q: 'Kaleci ofsaytta sayılır mı?', a: 'Evet. Ofsaytta kullanılan "sondan ikinci rakip" çizgisinde kaleci de bir oyuncu olarak sayılır.' },
      { q: 'Ofsayt pozisyonunda olmak suç mu?', a: 'Hayır. Ancak oyuna müdahale edildiğinde ceza verilir.' },
      { q: 'Kornerde ofsayt var mı?', a: 'Yok. Taç, korner ve kale vuruşundan ofsayt olmaz.' },
    ],
  },
];

export function ruleArticlePath(a: Pick<RuleArticle, 'slug'>): string {
  return a.slug ? `${RULES_HUB_PATH}/${a.slug}` : RULES_HUB_PATH;
}

export function findRuleArticle(slug: string): RuleArticle | undefined {
  return RULE_ARTICLES.find((a) => a.slug === slug);
}

/** `**kalın**` ve `[etiket](/yol)` işaretlerini düz metne çevirir (şema, meta). */
export function plainRuleText(s: string): string {
  return s.replace(/\[([^\]]+)\]\((\/[^)\s]*)\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

export type InlinePart = { kind: 'text' | 'bold'; text: string } | { kind: 'link'; text: string; href: string };

/** Satır içi işaretleri parçalara ayırır. Bağlantı yalnız site içi yol (`/` ile başlar); diğerleri düz metin kalır. */
export function parseInline(s: string): InlinePart[] {
  const out: InlinePart[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((\/[^)\s]*)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) });
    if (m[1] != null) out.push({ kind: 'bold', text: m[1] });
    else out.push({ kind: 'link', text: m[2]!, href: m[3]! });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) });
  return out;
}
