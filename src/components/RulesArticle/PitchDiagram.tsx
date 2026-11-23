import styles from './rulesArticle.module.scss';

/**
 * Ceza sahası ölçü şeması (statik SVG, Kural 1): kale, kale sahası, ceza sahası, penaltı noktası ve yayı.
 * Ölçek 1 m = 7 birim (ceza sahası 40,32 m → 282). Saha renkleri iki temada aynı; metin alternatifi figcaption'da.
 */
const M = 7;
const CX = 180;
const GOAL_LINE = 40;
const LINE = { stroke: '#fff', strokeOpacity: 0.8, strokeWidth: 2, fill: 'none' } as const;

export default function PitchDiagram() {
  const pa = { w: 40.32 * M, d: 16.5 * M };
  const ga = { w: 18.32 * M, d: 5.5 * M };
  const goalW = 7.32 * M;
  const spotY = GOAL_LINE + 11 * M;
  const arcR = 9.15 * M;
  const paBottom = GOAL_LINE + pa.d;
  const dx = Math.sqrt(arcR ** 2 - (paBottom - spotY) ** 2);
  const label = { fontFamily: 'inherit', fontSize: 11, fontWeight: 700, fill: '#fff' } as const;
  const dim = { stroke: '#ffd23f', strokeWidth: 1.5 } as const;

  return (
    <figure className={styles.figure}>
      <svg viewBox="0 0 360 236" role="img" aria-labelledby="saha-sema-baslik" className={styles.diagram}>
        <title id="saha-sema-baslik">
          Ceza sahası ölçüleri: kale 7,32 m, kale sahası 5,5 m, penaltı noktası 11 m, ceza sahası 16,5 m, yay yarıçapı 9,15 m
        </title>
        <rect x="0" y="0" width="360" height="236" rx="10" fill="#1f7a45" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="0" y={GOAL_LINE + i * 56} width="360" height="28" fill="#23854c" />
        ))}
        {/* kale çizgisi, kale, kale sahası, ceza sahası */}
        <line x1="0" y1={GOAL_LINE} x2="360" y2={GOAL_LINE} {...LINE} />
        <rect x={CX - goalW / 2} y={GOAL_LINE - 14} width={goalW} height="14" fill="none" stroke="#fff" strokeWidth="3" />
        <rect x={CX - ga.w / 2} y={GOAL_LINE} width={ga.w} height={ga.d} {...LINE} />
        <rect x={CX - pa.w / 2} y={GOAL_LINE} width={pa.w} height={pa.d} {...LINE} />
        {/* penaltı noktası ve yay */}
        <circle cx={CX} cy={spotY} r="3" fill="#fff" />
        <path d={`M ${CX - dx} ${paBottom} A ${arcR} ${arcR} 0 0 0 ${CX + dx} ${paBottom}`} {...LINE} />

        {/* ölçüler (sarı) */}
        <g {...dim}>
          {/* 16,5 m derinlik — sağda */}
          <line x1={CX + pa.w / 2 + 14} y1={GOAL_LINE} x2={CX + pa.w / 2 + 14} y2={paBottom} />
          {/* 5,5 m — kale sahası sağında */}
          <line x1={CX + ga.w / 2 + 10} y1={GOAL_LINE} x2={CX + ga.w / 2 + 10} y2={GOAL_LINE + ga.d} />
          {/* 11 m — penaltı noktasına */}
          <line x1={CX - 14} y1={GOAL_LINE} x2={CX - 14} y2={spotY} strokeDasharray="4 3" />
          {/* 9,15 m yarıçap */}
          <line x1={CX} y1={spotY} x2={CX + arcR * Math.cos((5 * Math.PI) / 12)} y2={spotY + arcR * Math.sin((5 * Math.PI) / 12)} strokeDasharray="4 3" />
          {/* 40,32 m genişlik — altta */}
          <line x1={CX - pa.w / 2} y1="224" x2={CX + pa.w / 2} y2="224" />
        </g>
        <g {...label}>
          <text x={CX + pa.w / 2 + 30} y={(GOAL_LINE + paBottom) / 2} textAnchor="middle" transform={`rotate(-90 ${CX + pa.w / 2 + 30} ${(GOAL_LINE + paBottom) / 2})`}>
            16,5 m
          </text>
          <text x={CX + ga.w / 2 + 16} y={GOAL_LINE + ga.d / 2 + 4}>5,5 m</text>
          <text x={CX - 20} y={(GOAL_LINE + spotY) / 2 + 12} textAnchor="end">11 m</text>
          <text x={CX + 24} y={spotY + arcR + 16}>9,15 m</text>
          <text x={CX} y={GOAL_LINE - 18} textAnchor="middle">Kale 7,32 × 2,44 m</text>
          <text x={CX} y="218" textAnchor="middle">Ceza sahası 40,32 m</text>
        </g>
      </svg>
      <figcaption>
        Ceza sahası kale direklerinden 16,5 m dışarıdan başlar ve sahaya 16,5 m girer; kale sahası aynı mantıkla 5,5 m&apos;dir. Penaltı
        noktası kale çizgisinden 11 m uzaktadır; yay, penaltı noktasına 9,15 m&apos;lik mesafeyi gösterir.
      </figcaption>
    </figure>
  );
}
