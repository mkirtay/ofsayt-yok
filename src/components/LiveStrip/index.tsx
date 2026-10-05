import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import type { Match } from '@/models/liveScore';
import { buildMatchHref } from '@/utils/matchUrl';
import { isModifiedClick } from '@/utils/matchSelection';
import { utcTimeToTr } from '@/utils/dateFormat';
import { isMatchLive } from '@/utils/matchActivity';
import { matchIstanbulDate } from '@/utils/matchActivity';
import styles from './liveStrip.module.scss';

const GOAL_FLASH_MS = 2500;

export type LiveStripProps = {
  matches: Match[];
  /** Önemli (iki büyük takım) yaklaşan maçlar: kartta ince işaret. */
  bigIds?: ReadonlySet<string>;
  /** Bugünün İstanbul günü — başka günün (yarın) kartında "Yarın" etiketi için. */
  todayIso?: string;
  /** Split-view'da maç detay paneli (verilmezse bağlantı maç sayfasına gider — mobil). */
  onSelectMatch?: (match: Match) => void;
  onPrefetchMatch?: (matchId: string) => void;
};

function scoreOf(m: Match): string {
  return (m.scores?.score || m.score || '').replace(/\s+/g, '');
}

function parts(score: string): [string, string] {
  const [h, a] = score.split(/[-–]/);
  return [h || '0', a || '0'];
}

/**
 * Lig filtre chip'lerinin yanındaki canlı maç şeridi: kompakt, yatay kaydırmalı kartlar. Canlı: yeşil nokta + dakika
 * (İY / ara dahil) + logolar + skor; değilse saat + logolar. Skor değişince kart kısa süre vurgulanır (reduced-motion
 * hariç, CSS). Kenarlarda fade, taşma varsa ok düğmeleri (masaüstü). Veri sayfanın mevcut listelerinden gelir.
 */
export default function LiveStrip({ matches, bigIds, todayIso, onSelectMatch, onPrefetchMatch }: LiveStripProps) {
  const { t } = useTranslation('match');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Skoru artan maç → kısa vurgu (ilk yüklemede ve listeye yeni giren maçta yok).
  const prevScores = useRef<Map<string, string>>(new Map());
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const next = new Map<string, string>();
    const changed: string[] = [];
    for (const m of matches) {
      const id = String(m.id);
      const sc = scoreOf(m);
      next.set(id, sc);
      const before = prevScores.current.get(id);
      if (before !== undefined && sc && before !== sc) changed.push(id);
    }
    prevScores.current = next;
    if (changed.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- skor değişimi → kısa vurgu
    setFlash((prev) => new Set([...prev, ...changed]));
    const timer = window.setTimeout(() => setFlash((prev) => new Set([...prev].filter((id) => !changed.includes(id)))), GOAL_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [matches]);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    measure();
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, matches]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    el?.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const label = t('liveStrip.label');

  return (
    <div className={styles.strip} role="region" aria-label={label} data-edge-left={edges.left || undefined} data-edge-right={edges.right || undefined}>
      <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => scrollBy(-1)} aria-label={t('liveStrip.prev')} tabIndex={edges.left ? 0 : -1}>
        ‹
      </button>
      <div ref={scrollerRef} className={styles.scroller} onScroll={measure}>
        {matches.map((m) => {
          const live = isMatchLive(m);
          const brk = m.status === 'HALF TIME BREAK';
          const minute = (m.time || '').replace(/'$/u, '').trim();
          const [hs, as] = parts(scoreOf(m));
          const kickoff = m.scheduled && /^\d{2}:\d{2}/.test(m.scheduled) ? utcTimeToTr(m.scheduled.slice(0, 5), m.date) : '—';
          const big = bigIds?.has(String(m.id)) ?? false;
          const tomorrow = !live && todayIso != null && matchIstanbulDate(m) !== todayIso;
          const homeName = m.home?.name || '';
          const awayName = m.away?.name || '';
          const status = brk ? t('halfTime') : minute ? `${minute}'` : t('liveStrip.liveShort');
          return (
            <Link
              key={m.id}
              href={buildMatchHref(m)}
              prefetch={false}
              className={`${styles.card} ${live ? styles.cardLive : ''} ${big ? styles.cardBig : ''} ${flash.has(String(m.id)) ? styles.cardFlash : ''}`.trim()}
              aria-label={`${homeName} ${live ? `${hs}-${as}` : kickoff} ${awayName}${big ? `, ${t('liveStrip.bigMatch')}` : ''}`}
              onMouseEnter={onPrefetchMatch ? () => onPrefetchMatch(String(m.id)) : undefined}
              onFocus={onPrefetchMatch ? () => onPrefetchMatch(String(m.id)) : undefined}
              onClick={
                onSelectMatch
                  ? (e) => {
                      if (isModifiedClick(e)) return;
                      e.preventDefault();
                      onPrefetchMatch?.(String(m.id));
                      onSelectMatch(m);
                    }
                  : undefined
              }
            >
              {live ? (
                <span className={styles.status}>
                  {brk ? null : <span className={styles.dot} aria-hidden="true" />}
                  {status}
                </span>
              ) : null}
              <TeamLogo src={m.home?.logo} alt="" className={styles.crest} width={18} height={18} />
              <span className={styles.mid}>{live ? <span className={styles.score}>{`${hs}–${as}`}</span> : <span className={styles.time}>
                    {tomorrow ? <span className={styles.tomorrow}>{t('liveStrip.tomorrow')} </span> : null}
                    {kickoff}
                  </span>}</span>
              <TeamLogo src={m.away?.logo} alt="" className={styles.crest} width={18} height={18} />
              {big ? <span className={styles.bigMark} title={t('liveStrip.bigMatch')} aria-hidden="true">★</span> : null}
            </Link>
          );
        })}
      </div>
      <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} onClick={() => scrollBy(1)} aria-label={t('liveStrip.next')} tabIndex={edges.right ? 0 : -1}>
        ›
      </button>
    </div>
  );
}
