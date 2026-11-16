import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { RULES_HUB } from '@/content/futbolKurallari';
import { Inline } from './index';
import RuleScene from './RuleScene';
import styles from './rulesExplorer.module.scss';

/** Her kural için tek bakışta özet kutuları: [değer, etiket]. Asıl metin RULES_HUB'da. */
const STATS: [string, string][][] = [
  [['100–110 m', 'Uzunluk'], ['64–75 m', 'Genişlik'], ['7,32 × 2,44 m', 'Kale'], ['11 m', 'Penaltı noktası']],
  [['68–70 cm', 'Çevre'], ['410–450 g', 'Ağırlık'], ['Küresel', 'Biçim']],
  [['11', 'Takım başı oyuncu'], ['7', 'En az oyuncu'], ['5', 'Değişiklik hakkı'], ['10 sn', 'Sahadan çıkış süresi']],
  [['5 parça', 'Zorunlu ekipman'], ['Yasak', 'Tehlikeli takı'], ['Çıkarılır', 'Bantlamak yetmez']],
  [['Kesin', 'Hakem kararı'], ['VAR', 'Yardımcı teknoloji'], ['Sahada', 'Son söz']],
  [['2', 'Yardımcı hakem'], ['1', 'Dördüncü hakem'], ['VAR + AVAR', 'Video ekibi']],
  [['2 × 45 dk', 'Devreler'], ['15 dk', 'En uzun devre arası'], ['+ Uzatma', 'Kayıp süreler eklenir']],
  [['Santra', 'Maçın başlangıcı'], ['Olur', 'Santradan doğrudan gol'], ['Hakem topu', 'Yeniden başlama']],
  [['Tamamen', 'Top çizgiyi geçmeli'], ['Oyunda', 'Çizgiye değiyorsa']],
  [['Tamamı', 'Top kale çizgisini geçer'], ['Uzatma', 'Eşitlik bozulmazsa'], ['Penaltılar', 'Hâlâ eşitse']],
  [['Pas anı', 'Karar anı'], ['Sondan 2.', 'Rakip oyuncu çizgisi'], ['Yok', 'Taç, korner, kale vuruşunda']],
  [['Sarı', 'Uyarı'], ['Kırmızı', 'İhraç'], ['2 sarı', '1 kırmızı eder']],
  [['Direkt', 'Doğrudan gol olur'], ['Endirekt', 'İkinci dokunuş şart'], ['9,15 m', 'Baraj mesafesi']],
  [['11 m', 'Mesafe'], ['Çizgide', 'Kalecinin ayağı'], ['İleri', 'Vuruş yönü']],
  [['İki el', 'Baş arkasından'], ['Olmaz', 'Doğrudan gol'], ['5 sn', 'Geri sayım']],
  [['Hemen', 'Top hareket edince oyunda'], ['5 sn', 'Geciktirme sınırı'], ['Korner', 'Süre aşılırsa']],
  [['Olur', 'Doğrudan gol'], ['8 sn', 'Kalecinin top tutma süresi'], ['Korner', 'Süre aşılırsa']],
];

/** Sol listedeki bölüm başlıkları: [başlık, ilk kural dizini]. */
const GROUPS: [string, number][] = [
  ['Temeller', 0],
  ['Hakemler', 4],
  ['Oyunun akışı', 6],
  ['İhlaller', 10],
  ['Duran toplar', 12],
];

const short = (heading: string) => heading.replace(/^Kural \d+ – /, '');
const pad = (n: number) => String(n).padStart(2, '0');
const groupOf = (i: number) => [...GROUPS].reverse().find(([, from]) => i >= from)![0];

/** /futbol-kurallari: solda 17 başlık, sağda seçili kuralın animasyonu + özet kutuları + kısa açıklaması. Tüm metin HTML'de kalır (SEO). */
export default function RulesExplorer() {
  const sections = RULES_HUB.sections;
  const total = sections.length;
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLDivElement | null>(null);

  const clamp = useCallback((i: number) => Math.max(0, Math.min(total - 1, i)), [total]);

  const select = useCallback(
    (i: number, focus = false) => {
      const n = clamp(i);
      setActive(n);
      if (focus) tabs.current[n]?.focus();
      try {
        window.history.replaceState(null, '', `#kural-${n + 1}`);
      } catch {
        /* yok say */
      }
    },
    [clamp],
  );

  useEffect(() => {
    // #kural-N ile gelen ziyaretçi (ilk yük ve sonradan değişen hash).
    const fromHash = () => {
      const m = /^#kural-(\d+)$/.exec(window.location.hash);
      if (m) setActive(clamp(Number(m[1]) - 1));
    };
    const t = window.setTimeout(fromHash, 0);
    window.addEventListener('hashchange', fromHash);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('hashchange', fromHash);
    };
  }, [clamp]);

  useEffect(() => {
    // Mobil yatay şerit: seçili çip ortaya gelsin (masaüstünde liste yatay kaymaz, etkisiz).
    const el = tabs.current[active];
    const box = list.current;
    if (!el || !box || box.scrollWidth <= box.clientWidth) return;
    box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [active]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const to = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: total - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(to, true);
  };

  return (
    <div className={styles.explorer}>
      <aside className={styles.rail}>
        <div className={styles.railHead}>
          <strong>17 kural</strong>
          <span>
            {pad(active + 1)} / {total}
          </span>
        </div>
        <div className={styles.progress} aria-hidden="true">
          <i style={{ width: `${((active + 1) / total) * 100}%` }} />
        </div>
        <div ref={list} className={styles.list} role="tablist" aria-label="17 futbol kuralı" aria-orientation="vertical">
          {sections.map((s, i) => {
            const group = GROUPS.find(([, from]) => from === i);
            return (
              <div key={s.id} role="presentation" className={styles.item}>
                {group ? (
                  <span className={styles.group} role="presentation">
                    {group[0]}
                  </span>
                ) : null}
                <button
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${s.id}`}
                  aria-selected={i === active}
                  aria-controls={s.id}
                  tabIndex={i === active ? 0 : -1}
                  className={`${styles.tab} ${i === active ? styles.tabActive : ''}`}
                  onClick={() => select(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <span className={styles.num}>{pad(i + 1)}</span>
                  <span className={styles.name}>{short(s.heading)}</span>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <div className={styles.detail}>
        {sections.map((s, i) => {
          const prev = sections[i - 1];
          const next = sections[i + 1];
          return (
            <section key={s.id} id={s.id} role="tabpanel" aria-labelledby={`tab-${s.id}`} hidden={i !== active} className={styles.panel}>
              <header className={styles.head}>
                <span className={styles.bigNum} aria-hidden="true">
                  {pad(i + 1)}
                </span>
                <div className={styles.headText}>
                  <p className={styles.eyebrow}>
                    {groupOf(i)} · Kural {i + 1}
                  </p>
                  <h2>{short(s.heading)}</h2>
                </div>
                <div className={styles.arrows}>
                  <button type="button" onClick={() => select(i - 1)} disabled={!prev} aria-label="Önceki kural">
                    ‹
                  </button>
                  <button type="button" onClick={() => select(i + 1)} disabled={!next} aria-label="Sonraki kural">
                    ›
                  </button>
                </div>
              </header>

              <div className={styles.body}>
                <div className={styles.scene}>{i === active ? <RuleScene rule={i + 1} title={short(s.heading)} /> : null}</div>
                <ul className={styles.stats}>
                  {STATS[i]?.map(([value, label]) => (
                    <li key={label}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {s.blocks.map((b, j) =>
                b.type === 'p' ? (
                  <p key={j} className={styles.text}>
                    <Inline text={b.text} />
                  </p>
                ) : null,
              )}

              <div className={styles.nav}>
                {prev ? (
                  <button type="button" onClick={() => select(i - 1)}>
                    <small>← Önceki</small>
                    <span>{short(prev.heading)}</span>
                  </button>
                ) : (
                  <span />
                )}
                {next ? (
                  <button type="button" className={styles.navNext} onClick={() => select(i + 1)}>
                    <small>Sonraki →</small>
                    <span>{short(next.heading)}</span>
                  </button>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
