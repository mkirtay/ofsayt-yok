import type { CSSProperties, ReactNode } from 'react';
import styles from './ruleScenes.module.scss';

/**
 * 17 kural için küçük, yalnız CSS ile hareket eden SVG sahneleri (ruleScenes.module.scss).
 * Sahne yalnız aktif kuralda render edilir; "Hareketi azalt"ta animasyon kapanır ve temel stil anlamlı tek kare verir.
 */

const W = 320;
const H = 180;

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const v = (o: Record<string, string | number>): Vars => o as Vars;

function Pitch({ children, dark = false }: { children?: ReactNode; dark?: boolean }) {
  return (
    <>
      <rect width={W} height={H} rx="10" fill={dark ? '#16241c' : '#1f7a45'} />
      {!dark &&
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <rect key={i} x={i * 40 + 20} y="0" width="20" height={H} fill="#23854c" />)}
      {children}
    </>
  );
}

const LINE = { stroke: '#fff', strokeOpacity: 0.75, strokeWidth: 2, fill: 'none' } as const;

function Dot({ x, y, c = 'blue', cls, style }: { x: number; y: number; c?: 'blue' | 'red' | 'gold' | 'black'; cls?: string; style?: Vars }) {
  const fill = { blue: '#2f6fe4', red: '#e5484d', gold: '#f5b301', black: '#222' }[c];
  return <circle cx={x} cy={y} r="8" fill={fill} stroke="#fff" strokeWidth="2" className={cls} style={style} />;
}

function Ball({ x, y, r = 5, cls, style }: { x: number; y: number; r?: number; cls?: string; style?: Vars }) {
  return <circle cx={x} cy={y} r={r} fill="#fff" stroke="#111" strokeWidth="1" className={cls} style={style} />;
}

function Label({ x, y, children, anchor = 'middle', cls, size = 11, fill = '#fff', style }: { x: number; y: number; children: ReactNode; anchor?: 'start' | 'middle' | 'end'; cls?: string; size?: number; fill?: string; style?: Vars }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight="700" fill={fill} className={cls} style={style}>
      {children}
    </text>
  );
}

/** Tam saha çizgileri (kural 1). */
function FieldLines() {
  const d = (p: string, i: number) => (
    <path key={i} d={p} pathLength={1} className={styles.draw} style={v({ '--d': `${i * 0.18}s` })} {...LINE} />
  );
  return (
    <>
      {[
        'M20 20H300V160H20Z',
        'M160 20V160',
        'M20 55H70V125H20',
        'M300 55H250V125H300',
        'M20 78H38V102H20',
        'M300 78H282V102H300',
      ].map(d)}
      <circle cx="160" cy="90" r="24" pathLength={1} className={styles.draw} style={v({ '--d': '1s' })} {...LINE} />
    </>
  );
}

function Scene1() {
  return (
    <>
      <Pitch>
        <FieldLines />
        <Label x={160} y={13} cls={styles.fadeIn} style={v({ '--d': '1.2s' })}>100–110 m</Label>
        <g transform="rotate(90 310 90)"><Label x={310} y={94} cls={styles.fadeIn} style={v({ '--d': '1.4s' })} size={10}>64–75 m</Label></g>
        <Label x={160} y={176} cls={styles.fadeIn} style={v({ '--d': '1.6s' })} size={10}>Kale 7,32 m · Penaltı noktası 11 m</Label>
      </Pitch>
    </>
  );
}

function Scene2() {
  return (
    <>
      <Pitch dark />
      <ellipse cx="160" cy="150" rx="34" ry="7" fill="#000" opacity=".35" className={styles.shadowBounce} />
      <g className={styles.bounce}>
        <g className={styles.spin}>
          <circle cx="160" cy="82" r="38" fill="#fff" stroke="#111" strokeWidth="2" />
          <polygon points="160,62 178,75 171,96 149,96 142,75" fill="#222" />
          <path d="M160 62V46M178 75L194 70M171 96L182 110M149 96L138 110M142 75L126 70" stroke="#222" strokeWidth="2" />
        </g>
      </g>
      <Label x={55} y={96} size={12} cls={styles.fadeIn} style={v({ '--d': '.3s' })}>68–70 cm</Label>
      <Label x={265} y={96} size={12} cls={styles.fadeIn} style={v({ '--d': '.6s' })}>410–450 g</Label>
    </>
  );
}

function Scene3() {
  const pts: [number, number, 'blue' | 'gold'][] = [
    [34, 90, 'gold'],
    [92, 36, 'blue'], [92, 68, 'blue'], [92, 112, 'blue'], [92, 144, 'blue'],
    [160, 36, 'blue'], [160, 68, 'blue'], [160, 112, 'blue'], [160, 144, 'blue'],
    [226, 66, 'blue'], [226, 114, 'blue'],
  ];
  return (
    <>
      <Pitch />
      {pts.map(([x, y, c], i) => (
        <Dot key={i} x={x} y={y} c={c} cls={styles.pop} style={v({ '--d': `${i * 0.18}s` })} />
      ))}
      <Label x={286} y={96} size={30} cls={styles.fadeIn} style={v({ '--d': '2s' })}>11</Label>
      <Label x={286} y={114} size={10} cls={styles.fadeIn} style={v({ '--d': '2s' })}>oyuncu</Label>
      <Label x={286} y={150} size={10} cls={styles.fadeIn} style={v({ '--d': '2.3s' })} fill="#ffd23f">En az 7</Label>
    </>
  );
}

function Scene4() {
  const items = ['Forma', 'Şort', 'Tozluk', 'Tekmelik', 'Ayakkabı'];
  return (
    <>
      <Pitch dark />
      {items.map((t, i) => (
        <g key={t} transform={`translate(70 ${22 + i * 28})`}>
          <rect width="180" height="22" rx="11" fill="#fff" opacity=".1" />
          <rect width="180" height="22" rx="11" fill="#00a76f" className={styles.fillRow} style={v({ '--d': `${i * 0.5}s` })} />
          <text x="16" y="15" fontSize="12" fontWeight="700" fill="#fff">{t}</text>
          <g className={styles.pop} style={v({ '--d': `${i * 0.5 + 0.3}s` })}>
            <circle cx="160" cy="11" r="7" fill="#fff" />
            <path d="M156 11l3 3 5-6" stroke="#00875a" strokeWidth="2" fill="none" />
          </g>
        </g>
      ))}
    </>
  );
}

function Scene5() {
  const sats: [number, number, string][] = [[60, 40, 'VAR'], [260, 40, 'Yrd. hakem'], [160, 150, '4. hakem']];
  return (
    <>
      <Pitch dark />
      {sats.map(([x, y, t], i) => (
        <g key={t}>
          <line x1={x} y1={y} x2="160" y2="82" stroke="#00a76f" strokeWidth="2" strokeDasharray="5 5" className={styles.march} style={v({ '--d': `${i * 0.3}s` })} />
          <circle cx={x} cy={y} r="17" fill="#222" stroke="#fff" strokeWidth="2" />
          <Label x={x} y={y + 4} size={9}>{t}</Label>
        </g>
      ))}
      <circle cx="160" cy="82" r="22" fill="none" stroke="#ffd23f" strokeWidth="2" className={styles.ring} />
      <circle cx="160" cy="82" r="22" fill="none" stroke="#ffd23f" strokeWidth="2" className={styles.ring} style={v({ '--d': '1s' })} />
      <circle cx="160" cy="82" r="20" fill="#111" stroke="#fff" strokeWidth="2" />
      <Label x={160} y={86} size={11}>Hakem</Label>
      <Label x={160} y={176} size={10} fill="#ffd23f">Son karar sahadaki hakemin</Label>
    </>
  );
}

function Scene6() {
  return (
    <>
      <Pitch>
        <path d="M20 30H300V150H20Z" {...LINE} />
        <path d="M160 30V150" {...LINE} />
      </Pitch>
      <Dot x={160} y={90} c="black" cls={styles.roam} />
      <g className={styles.slideA}>
        <Dot x={90} y={30} c="gold" />
        <path d="M90 22v-14l12 5-12 5" fill="#ffd23f" stroke="#ffd23f" className={styles.flagUp} />
      </g>
      <g className={styles.slideB}>
        <Dot x={230} y={150} c="gold" />
      </g>
      <Dot x={30} y={166} c="black" />
      <Label x={110} y={20} size={9} cls={styles.fadeIn}>Yardımcı hakem</Label>
      <Label x={52} y={176} size={9} anchor="start">4. hakem</Label>
      <Label x={160} y={125} size={9} cls={styles.fadeIn}>Hakem</Label>
    </>
  );
}

function Scene7() {
  return (
    <>
      <Pitch dark />
      <circle cx="62" cy="84" r="40" fill="#fff" opacity=".08" stroke="#fff" strokeWidth="3" />
      <g transform="translate(62 84)">
        <line x1="0" y1="0" x2="0" y2="-30" stroke="#ffd23f" strokeWidth="3" strokeLinecap="round" className={styles.hand} />
        <circle r="4" fill="#fff" />
      </g>
      <g transform="translate(118 62)">
        <rect width="186" height="14" rx="7" fill="#fff" opacity=".1" />
        <rect width="80" height="14" rx="7" fill="#00a76f" className={styles.half1} />
        <rect x="106" width="80" height="14" rx="7" fill="#00a76f" className={styles.half2} />
        <Label x={40} y={34} size={10}>1. devre 45′</Label>
        <Label x={93} y={13} size={9}>15′</Label>
        <Label x={146} y={34} size={10}>2. devre 45′</Label>
        <Label x={93} y={62} size={12} fill="#ffd23f" cls={styles.extra}>+ uzatma</Label>
      </g>
    </>
  );
}

function Scene8() {
  return (
    <>
      <Pitch>
        <path d="M160 14V166" {...LINE} />
        <circle cx="160" cy="90" r="30" {...LINE} />
      </Pitch>
      <Dot x={196} y={72} c="red" />
      <Dot x={196} y={108} c="red" />
      <Dot x={240} y={90} c="red" />
      <Dot x={140} y={68} c="blue" />
      <Dot x={116} y={116} c="blue" />
      <Dot x={148} y={96} c="blue" />
      <Ball x={160} y={90} cls={styles.kickoff} />
      <Label x={160} y={176} size={10} cls={styles.fadeIn}>Santra · doğrudan gol olabilir</Label>
    </>
  );
}

function Scene9() {
  return (
    <>
      <Pitch />
      <rect x="0" y="100" width={W} height="80" fill="#0e3b21" opacity=".75" />
      <line x1="0" y1="100" x2={W} y2="100" stroke="#fff" strokeWidth="3" />
      <Ball x={160} y={44} r={10} cls={styles.crossLine} />
      <Label x={250} y={40} size={12} fill="#7ee2a8" cls={styles.stateIn}>Oyunda</Label>
      <Label x={250} y={40} size={12} fill="#ff8b8e" cls={styles.stateOut}>Dışarıda</Label>
      <Label x={160} y={170} size={10}>Top çizgiyi tamamen geçmeli</Label>
    </>
  );
}

function Scene10() {
  return (
    <>
      <Pitch>
        <path d="M270 56V124" stroke="#fff" strokeWidth="3" />
        <rect x="270" y="56" width="32" height="68" fill="#fff" opacity=".12" />
        <path d="M270 70H302M270 84H302M270 98H302M270 112H302M282 56V124M294 56V124" stroke="#fff" strokeOpacity=".35" />
      </Pitch>
      <circle cx="270" cy="56" r="4" fill="#fff" />
      <circle cx="270" cy="124" r="4" fill="#fff" />
      <Dot x={70} y={150} c="blue" />
      <Ball x={86} y={142} cls={styles.shoot} />
      <Label x={160} y={80} size={26} fill="#ffd23f" cls={styles.goalPop}>GOL!</Label>
      <Label x={160} y={176} size={10}>Topun tamamı çizgiyi geçmeli</Label>
    </>
  );
}

function Scene11() {
  return (
    <>
      <Pitch>
        <line x1="40" y1="0" x2="40" y2={H} stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
      </Pitch>
      <line x1="226" y1="10" x2="226" y2="170" stroke="#ffd23f" strokeWidth="2" strokeDasharray="6 5" />
      <Dot x={226} y={110} c="red" />
      <Dot x={190} y={56} c="red" />
      <Dot x={298} y={92} c="red" />
      <Dot x={110} y={130} c="blue" />
      <Dot x={226} y={152} c="blue" />
      <Dot x={256} y={70} c="blue" cls={styles.offsideMan} />
      <Ball x={124} y={120} cls={styles.passBall} />
      <Label x={218} y={22} anchor="end" size={10}>Sondan ikinci rakip</Label>
      <Label x={110} y={156} size={10}>Pas anı</Label>
      <Label x={256} y={50} size={13} fill="#ff8b8e" cls={styles.flagText}>OFSAYT</Label>
    </>
  );
}

function Scene12() {
  return (
    <>
      <Pitch dark />
      <g className={styles.tackleA}><Dot x={60} y={110} c="blue" /></g>
      <g className={styles.tackleB}><Dot x={100} y={110} c="red" /></g>
      <Label x={80} y={86} size={20} fill="#ffd23f" cls={styles.burst}>!</Label>
      <Dot x={190} y={118} c="black" />
      <rect x="200" y="62" width="24" height="34" rx="3" fill="#ffd23f" className={styles.cardYellow} />
      <rect x="200" y="62" width="24" height="34" rx="3" fill="#e5484d" className={styles.cardRed} />
      <Label x={256} y={78} size={11} fill="#ffd23f" cls={styles.capYellow}>Uyarı</Label>
      <Label x={256} y={78} size={11} fill="#ff8b8e" cls={styles.capRed}>İhraç</Label>
      <Label x={160} y={170} size={10}>2 sarı kart = 1 kırmızı kart</Label>
    </>
  );
}

function Scene13() {
  return (
    <>
      <Pitch>
        <path d="M250 60V120" stroke="#fff" strokeWidth="3" />
        <rect x="250" y="70" width="20" height="40" fill="#fff" opacity=".15" />
      </Pitch>
      {[56, 73, 90, 107, 124].map((y) => (
        <Dot key={y} x={184} y={y} c="red" />
      ))}
      <path d="M64 150H182" stroke="#ffd23f" strokeWidth="1.5" strokeDasharray="4 4" />
      <Label x={123} y={166} size={10} fill="#ffd23f">9,15 m</Label>
      <Dot x={52} y={150} c="blue" />
      <Ball x={66} y={146} cls={styles.freeKick} />
    </>
  );
}

function Scene14() {
  return (
    <>
      <Pitch>
        <rect x="90" y="14" width="140" height="22" fill="#fff" opacity=".14" />
        <path d="M90 36V14H230V36" stroke="#fff" strokeWidth="3" fill="none" />
        <path d="M60 14V90H260V14" {...LINE} />
      </Pitch>
      <circle cx="160" cy="112" r="3" fill="#fff" />
      <Label x={190} y={118} size={10} anchor="start">11 m</Label>
      <g className={styles.keeperDive}><Dot x={160} y={32} c="gold" /></g>
      <g className={styles.kickerRun}><Dot x={160} y={150} c="blue" /></g>
      <Ball x={160} y={112} cls={styles.penaltyBall} />
      <Label x={160} y={176} size={10}>Kaleci vuruş anında çizgide</Label>
    </>
  );
}

function Scene15() {
  return (
    <>
      <Pitch>
        <path d="M0 140H320" stroke="#fff" strokeWidth="3" />
      </Pitch>
      <rect x="0" y="140" width={W} height="40" fill="#0e3b21" opacity=".75" />
      <Dot x={70} y={152} c="blue" />
      <Dot x={210} y={84} c="blue" />
      <Dot x={190} y={64} c="red" />
      <Ball x={70} y={134} cls={styles.throwIn} />
      <g transform="translate(266 88)">
        <circle r="24" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="5" />
        <circle r="24" fill="none" stroke="#ffd23f" strokeWidth="5" strokeLinecap="round" pathLength={1} className={styles.countdown} transform="rotate(-90)" />
        <Label x={0} y={4} size={12}>5 sn</Label>
      </g>
      <Label x={110} y={170} size={10}>İki el, baş arkasından</Label>
    </>
  );
}

function Scene16() {
  return (
    <>
      <Pitch>
        <path d="M0 40H100V140H0" {...LINE} />
        <path d="M0 66H40V114H0" {...LINE} />
        <path d="M0 78H-4V102H0" stroke="#fff" strokeWidth="3" />
      </Pitch>
      <Dot x={14} y={90} c="gold" />
      <Dot x={190} y={60} c="red" />
      <Dot x={210} y={120} c="blue" />
      <Ball x={52} y={90} cls={styles.goalKick} />
      <Label x={190} y={170} size={10}>Top hareket edince oyunda</Label>
    </>
  );
}

function Scene17() {
  return (
    <>
      <Pitch>
        <path d="M300 30V150" stroke="#fff" strokeWidth="2" />
        <path d="M300 62H252V118H300" {...LINE} />
        <path d="M300 72H302V108H300" stroke="#fff" strokeWidth="3" />
        <path d="M280 12A20 20 0 0 0 300 32" {...LINE} />
      </Pitch>
      <path d="M296 14v-12l10 4-10 4" fill="#ffd23f" />
      <Dot x={296} y={30} c="blue" cls={styles.cornerTaker} />
      <Dot x={240} y={84} c="blue" />
      <Dot x={258} y={104} c="blue" />
      <Dot x={228} y={112} c="red" />
      <Dot x={262} y={72} c="red" />
      <Ball x={290} y={32} cls={styles.cornerBall} />
      <Label x={130} y={90} size={10} cls={styles.fadeIn}>Doğrudan gol olabilir</Label>
    </>
  );
}

const SCENES = [Scene1, Scene2, Scene3, Scene4, Scene5, Scene6, Scene7, Scene8, Scene9, Scene10, Scene11, Scene12, Scene13, Scene14, Scene15, Scene16, Scene17];

export default function RuleScene({ rule, title }: { rule: number; title: string }) {
  const Scene = SCENES[rule - 1];
  if (!Scene) return null;
  return (
    <div className={styles.stage}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} animasyonu`} className={styles.svg} key={rule}>
        <Scene />
      </svg>
    </div>
  );
}
