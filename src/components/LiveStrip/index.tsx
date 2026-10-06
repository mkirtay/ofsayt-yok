import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import { narrowTeamName } from '@/components/MatchList/TeamNameLabel';
import type { Match } from '@/models/liveScore';
import { buildMatchHref } from '@/utils/matchUrl';
import { isModifiedClick } from '@/utils/matchSelection';
import { isMatchLive } from '@/utils/matchActivity';
import { finishedLabelKey } from '@/utils/finishLabel';
import { leagueNameById } from '@/utils/leagueName';
import styles from './liveStrip.module.scss';

const GOAL_FLASH_MS = 2500;

export type LiveStripProps = {
  matches: Match[];
  /** Split-view'da maç detay paneli (verilmezse bağlantı maç sayfasına gider — mobil). */
  onSelectMatch?: (match: Match) => void;
  onPrefetchMatch?: (matchId: string) => void;
};

function scoreParts(m: Match): [string, string] {
  const raw = (m.scores?.score || m.score || '').replace(/\s+/g, '');
  const [h, a] = raw.split(/[-–]/);
  return [h || '0', a || '0'];
}

function TeamRow({ team, goals }: { team: Match['home']; goals: string }) {
  const name = team?.name || '';
  const short = narrowTeamName(team?.id, name) ?? name;
  return (
    <span className={styles.teamRow}>
      <TeamLogo src={team?.logo} alt="" className={styles.crest} width={16} height={16} />
      <span className={styles.teamName} title={name}>
        {short}
      </span>
      <span className={styles.goals}>{goals}</span>
    </span>
  );
}

/**
 * Maç listesinin üstündeki canlı maç şeridi: yatay kaydırmalı kompakt kartlar. Kart: lig adı (küçük) + durum (canlı:
 * nabız atan nokta + dakika / İY; bitmiş: MS rozeti), iki takım satırı (logo + kısa ad + skor). Skor değişince kart kısa
 * süre vurgulanır (reduced-motion hariç, CSS). Kenarlarda fade, taşma varsa ok düğmeleri (masaüstü). Seçimi
 * `utils/liveStrip.ts` yapar; veri sayfanın mevcut listelerinden gelir (yeni istek yok).
 */
export default function LiveStrip({ matches, onSelectMatch, onPrefetchMatch }: LiveStripProps) {
  const { t } = useTranslation('match');
  const { t: tl } = useTranslation('leagues');
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Skoru değişen maç → kısa vurgu (ilk yüklemede ve listeye yeni giren maçta yok).
  const prevScores = useRef<Map<string, string>>(new Map());
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const next = new Map<string, string>();
    const changed: string[] = [];
    for (const m of matches) {
      const id = String(m.id);
      const sc = scoreParts(m).join('-');
      next.set(id, sc);
      const before = prevScores.current.get(id);
      if (before !== undefined && before !== sc) changed.push(id);
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
    el?.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  return (
    <div className={styles.strip} role="region" aria-label={t('liveStrip.label')} data-edge-left={edges.left || undefined} data-edge-right={edges.right || undefined}>
      <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} onClick={() => scrollBy(-1)} aria-label={t('liveStrip.prev')} tabIndex={edges.left ? 0 : -1}>
        ‹
      </button>
      <div ref={scrollerRef} className={styles.scroller} onScroll={measure}>
        {matches.map((m) => {
          const live = isMatchLive(m);
          const brk = m.status === 'HALF TIME BREAK';
          const minute = (m.time || '').replace(/'$/u, '').trim();
          const [hs, as] = scoreParts(m);
          const league = leagueNameById(m.competition?.id, m.competition?.name, tl);
          const homeName = m.home?.name || '';
          const awayName = m.away?.name || '';
          return (
            <Link
              key={m.id}
              href={buildMatchHref(m)}
              prefetch={false}
              className={`${styles.card} ${live ? styles.cardLive : ''} ${flash.has(String(m.id)) ? styles.cardFlash : ''}`.trim()}
              aria-label={`${homeName} ${hs}-${as} ${awayName}`}
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
              <span className={styles.head}>
                {live ? (
                  <span className={styles.status}>
                    {brk ? null : <span className={styles.dot} aria-hidden="true" />}
                    {brk ? t('halfTime') : minute ? `${minute}'` : t('liveStrip.liveShort')}
                  </span>
                ) : (
                  <span className={styles.ft}>{t(finishedLabelKey(m))}</span>
                )}
                <span className={styles.league} title={league}>
                  {league}
                </span>
              </span>
              <TeamRow team={m.home} goals={hs} />
              <TeamRow team={m.away} goals={as} />
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
