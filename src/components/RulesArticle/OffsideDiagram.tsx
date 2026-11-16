import styles from './rulesArticle.module.scss';

/**
 * Ofsayt şeması (statik SVG): pas anı, sondan ikinci rakip çizgisi, ofsayttaki ve hizadaki hücumcu.
 * Saha renkleri iki temada aynı; metin alternatif olarak figcaption'da.
 */
export default function OffsideDiagram() {
  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 360 200" role="img" aria-labelledby="ofsayt-sema-baslik" className={styles.diagram}>
        <title id="ofsayt-sema-baslik">Ofsayt şeması: pas anında sondan ikinci rakibin önündeki hücumcu ofsayttadır</title>
        <rect x="0" y="0" width="360" height="200" rx="10" fill="#1f7a45" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={i * 60} y="0" width="30" height="200" fill="#23854c" />
        ))}
        {/* orta çizgi ve kale */}
        <line x1="40" y1="0" x2="40" y2="200" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
        <rect x="300" y="45" width="60" height="110" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
        <rect x="346" y="78" width="14" height="44" fill="none" stroke="#fff" strokeWidth="3" />
        {/* sondan ikinci rakip çizgisi */}
        <line x1="236" y1="8" x2="236" y2="192" stroke="#ffd23f" strokeWidth="2" strokeDasharray="6 5" />
        {/* savunma (kırmızı) + kaleci */}
        <circle cx="236" cy="120" r="9" fill="#e5484d" stroke="#fff" strokeWidth="2" />
        <circle cx="200" cy="60" r="9" fill="#e5484d" stroke="#fff" strokeWidth="2" />
        <circle cx="340" cy="100" r="9" fill="#e5484d" stroke="#fff" strokeWidth="2" />
        {/* pas veren (mavi) + top */}
        <circle cx="120" cy="140" r="9" fill="#2f6fe4" stroke="#fff" strokeWidth="2" />
        <circle cx="132" cy="128" r="4.5" fill="#fff" />
        {/* ofsayttaki hücumcu */}
        <circle cx="262" cy="80" r="9" fill="#2f6fe4" stroke="#fff" strokeWidth="2" />
        <line x1="136" y1="124" x2="250" y2="86" stroke="#fff" strokeWidth="1.5" strokeDasharray="3 4" />
        {/* hizadaki hücumcu */}
        <circle cx="236" cy="165" r="9" fill="#2f6fe4" stroke="#fff" strokeWidth="2" />
        <g fontFamily="inherit" fontSize="11" fontWeight="700" fill="#fff">
          <text x="246" y="20">Sondan ikinci rakip</text>
          <text x="274" y="70">Ofsayt</text>
          <text x="224" y="190" textAnchor="end">Aynı hizada: ofsayt değil</text>
          <text x="120" y="164" textAnchor="middle">Pas anı</text>
        </g>
      </svg>
      <figcaption>
        Pas anında sarı çizginin (sondan ikinci rakip) önündeki hücumcu ofsayt pozisyonundadır; çizgiyle aynı hizadaki hücumcu ofsayt
        değildir.
      </figcaption>
    </figure>
  );
}
