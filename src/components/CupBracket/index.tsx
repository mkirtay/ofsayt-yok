/**
 * Kupa eleme ağacı (Puan Durumu sayfasının "Eleme Ağacı" sekmesi; tembel parça — ilk yüke girmez).
 *
 * Masaüstü (≥ 1024): ağaç turları soldan sağa sütunlar + bağlantı çizgileri; ön eleme / erken turlar çip ile liste.
 * Mobil: tur çipleri + seçili turun dikey listesi (yatay kaydırmalı ağaç YOK). İki görünüm de çizilir, CSS biri gizler
 * (veri istemcide hazır; görünüm değişince yeniden istek yok).
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import '@/lib/i18nNamespaces/cupBracket';
import { useI18n, useTranslation } from '@/lib/i18n';
import TeamLogo from '@/components/TeamLogo';
import type { CupBracket as CupBracketModel, CupLeg, CupRound, CupTeam, CupTie } from '@/services/cupBracket/types';
import { isLegFinished, isLegLive } from '@/services/cupBracket/legState';
import { buildMatchHref } from '@/utils/matchUrl';
import {
  connectorsFor,
  defaultSelection,
  formatKickoff,
  goalsFor,
  isTbdTie,
  legTeams,
  listRounds,
  primaryLeg,
  roundLabel,
  tieMeta,
  treeRounds,
  type Connector,
} from './view';
import styles from './cupBracket.module.scss';

type T = (key: string, opts?: Record<string, unknown>) => string;

function legHref(tie: CupTie, leg: CupLeg): string {
  const { home, away } = legTeams(tie, leg);
  return buildMatchHref({ id: leg.fixtureId, home: home ? { name: home.name } : null, away: away ? { name: away.name } : null });
}

function TeamRow({ tie, team, twoLegged }: { tie: CupTie; team: CupTeam | null; twoLegged: boolean }) {
  if (!team) {
    return (
      <div className={`${styles.teamRow} ${styles.teamTbd}`}>
        <span className={styles.logoSlot} aria-hidden="true" />
        <span className={styles.tbdBar} aria-hidden="true" />
      </div>
    );
  }
  const decided = tie.winnerId != null;
  const isWinner = tie.winnerId === team.id;
  const side = tie.home?.id === team.id ? 'home' : 'away';
  const total = twoLegged ? tie.agg?.[side] : (tie.legs[0] ? goalsFor(tie.legs[0], team.id) : null);
  const singlePens = !twoLegged && tie.pens ? tie.pens[side] : null;
  return (
    <div className={`${styles.teamRow} ${decided ? (isWinner ? styles.winner : styles.loser) : ''}`.trim()}>
      <span className={styles.logoSlot}>
        <TeamLogo src={team.logo} width={18} alt="" />
      </span>
      <span className={styles.teamName} title={team.name}>
        {team.name}
      </span>
      {twoLegged
        ? tie.legs.map((l) => (
            <span key={l.fixtureId} className={styles.legGoal}>
              {goalsFor(l, team.id) ?? ''}
            </span>
          ))
        : null}
      <span className={styles.total}>
        {total ?? ''}
        {singlePens != null ? <sup className={styles.pens}>({singlePens})</sup> : null}
      </span>
    </div>
  );
}

function TieBox({ tie, mode }: { tie: CupTie; mode: 'tree' | 'list' }) {
  const { t } = useTranslation('cupBracket');
  const { t: tm } = useTranslation('match');
  const { locale } = useI18n();
  const twoLegged = tie.legs.length > 1;
  const body = (
    <>
      <TeamRow tie={tie} team={tie.home} twoLegged={twoLegged} />
      <TeamRow tie={tie} team={tie.away} twoLegged={twoLegged} />
    </>
  );

  if (isTbdTie(tie)) {
    return (
      <div className={`${styles.box} ${styles.boxTbd}`} aria-label={t('tbd')}>
        {body}
        <div className={styles.meta}>{t('tbd')}</div>
      </div>
    );
  }

  const meta = tieMeta(tie, t, locale);
  const metaEl = (
    <div className={`${styles.meta} ${meta.live ? styles.metaLive : ''}`.trim()}>
      {meta.live ? <span className={styles.liveDot} aria-hidden="true" /> : null}
      {meta.text || ' '}
    </div>
  );
  const winnerName = tie.winnerId === tie.home?.id ? tie.home?.name : tie.winnerId === tie.away?.id ? tie.away?.name : null;

  const summary =
    mode === 'list'
      ? [
          tie.agg?.final ? tm('aggregate.total', { home: tie.agg.home, away: tie.agg.away }) : null,
          winnerName ? tm('aggregate.advanced', { team: winnerName }) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const summaryEl = summary ? <div className={styles.summary}>{summary}</div> : null;
  const boxClass = `${styles.box} ${mode === 'list' ? styles.boxList : ''}`.trim();

  // Ağaç kutusu ve tek maçlık liste kutusu: kutunun tamamı maç sayfasına bağlantı.
  if (mode === 'tree' || !twoLegged) {
    const leg = primaryLeg(tie);
    const label = t('openMatch', { home: tie.home!.name, away: tie.away!.name });
    return leg ? (
      <Link href={legHref(tie, leg)} prefetch={false} className={`${boxClass} ${styles.boxLink}`} aria-label={label} title={label}>
        {body}
        {metaEl}
        {summaryEl}
      </Link>
    ) : (
      <div className={boxClass}>
        {body}
        {metaEl}
        {summaryEl}
      </div>
    );
  }

  // İki ayaklı liste kutusu: her ayak ayrı bağlantı + toplam / tur atlayan notu (maç kartı TiePill ile aynı metinler).
  return (
    <div className={boxClass}>
      {body}
      {metaEl}
      <div className={styles.legLinks}>
        {tie.legs.map((l, i) => {
          const { home, away } = legTeams(tie, l);
          const played = (isLegFinished(l.stateId) || isLegLive(l.stateId)) && l.homeGoals != null;
          return (
            <Link key={l.fixtureId} href={legHref(tie, l)} prefetch={false} className={styles.legLink}>
              <span className={styles.legNo}>{t('leg', { n: i + 1 })}</span>
              <span className={styles.legText}>
                {played
                  ? `${home?.name ?? '?'} ${l.homeGoals}–${l.awayGoals} ${away?.name ?? '?'}`
                  : `${home?.name ?? '?'} – ${away?.name ?? '?'} · ${formatKickoff(l.startingAt, locale, true)}`}
              </span>
            </Link>
          );
        })}
      </div>
      {summaryEl}
    </div>
  );
}

function TreeView({ rounds, t }: { rounds: CupRound[]; t: T }) {
  const connectors = useMemo(() => connectorsFor(rounds), [rounds]);
  const rows = Math.max(1, ...rounds.map((r) => r.ties.length));
  return (
    <div className={styles.tree} style={{ ['--bracket-rows' as string]: rows, ['--bracket-cols' as string]: rounds.length }}>
      {rounds.map((r, ci) => {
        const prev = rounds[ci - 1];
        const incomingPairs = new Set(
          (prev?.ties ?? []).filter((_, i) => connectors[ci - 1]?.[i] === 'pairTop' || connectors[ci - 1]?.[i] === 'pairBottom').map((x) => x.nextTieId),
        );
        return (
          <section key={r.key} className={styles.column} aria-label={roundLabel(r, t)}>
            <h3 className={styles.columnHead}>
              {roundLabel(r, t)}
              <span className={`${styles.status} ${styles[`status_${r.status}`] ?? ''}`.trim()}>{t(`status.${r.status}`)}</span>
            </h3>
            <ol className={styles.columnBody} style={{ gridTemplateRows: `repeat(${r.ties.length}, 1fr)` }}>
              {r.ties.map((tie, ri) => {
                const c: Connector = connectors[ci]?.[ri] ?? null;
                return (
                  <li
                    key={tie.id}
                    className={[styles.slot, c ? styles[`out_${c}`] : '', incomingPairs.has(tie.id) ? styles.inPair : ''].filter(Boolean).join(' ')}
                  >
                    <TieBox tie={tie} mode="tree" />
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

function ListView({ round, t, onShowStandings, leagueStageLabel }: { round: CupRound; t: T; onShowStandings?: () => void; leagueStageLabel: string | null }) {
  if (round.status === 'tbd') {
    return (
      <div className={styles.tbdNote}>
        <p>{t('tbdRound')}</p>
        {onShowStandings && leagueStageLabel ? (
          <button type="button" className={styles.linkButton} onClick={onShowStandings}>
            {leagueStageLabel} →
          </button>
        ) : null}
      </div>
    );
  }
  return (
    <ol className={styles.list} aria-label={roundLabel(round, t)}>
      {round.ties.map((tie) => (
        <li key={tie.id}>
          <TieBox tie={tie} mode="list" />
        </li>
      ))}
    </ol>
  );
}

function Chips({
  items,
  selected,
  onSelect,
  label,
}: {
  items: { key: string; label: string; status?: CupRound['status'] }[];
  selected: string;
  onSelect: (key: string) => void;
  label: string;
}) {
  if (items.length <= 1) return null;
  return (
    <div className={styles.chips} role="group" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          aria-pressed={selected === it.key}
          className={`${styles.chip} ${selected === it.key ? styles.chipActive : ''} ${it.status === 'current' ? styles.chipCurrent : ''}`.trim()}
          onClick={() => onSelect(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export default function CupBracket({ bracket, onShowStandings }: { bracket: CupBracketModel; onShowStandings?: () => void }) {
  const { t } = useTranslation('cupBracket');
  const initial = useMemo(() => defaultSelection(bracket), [bracket]);
  const [desktopSel, setDesktopSel] = useState<string | null>(null);
  const [mobileSel, setMobileSel] = useState<string | null>(null);
  const desktop = desktopSel ?? initial.desktop;
  const mobile = mobileSel ?? initial.mobile;

  const tree = treeRounds(bracket);
  const early = listRounds(bracket);
  const leagueStageLabel = bracket.leagueStage ? t(bracket.leagueStage.kind === 'group' ? 'groupStageLink' : 'leagueStageLink') : null;
  const desktopItems = [...early.map((r) => ({ key: r.key, label: roundLabel(r, t), status: r.status })), ...(tree.length ? [{ key: 'tree', label: t('treeChip') }] : [])];
  const mobileItems = bracket.rounds.map((r) => ({ key: r.key, label: roundLabel(r, t), status: r.status }));
  const desktopRound = early.find((r) => r.key === desktop);
  const mobileRound = bracket.rounds.find((r) => r.key === mobile) ?? bracket.rounds[0];

  return (
    <div className={styles.root} role="region" aria-label={t('regionLabel')}>
      {onShowStandings && leagueStageLabel ? (
        <div className={styles.topLinks}>
          <button type="button" className={styles.linkButton} onClick={onShowStandings}>
            {leagueStageLabel} →
          </button>
        </div>
      ) : null}

      <div className={styles.desktopOnly}>
        <Chips items={desktopItems} selected={desktopRound ? desktop : 'tree'} onSelect={setDesktopSel} label={t('roundsLabel')} />
        {desktopRound ? <ListView round={desktopRound} t={t} leagueStageLabel={leagueStageLabel} onShowStandings={onShowStandings} /> : <TreeView rounds={tree} t={t} />}
      </div>

      <div className={styles.mobileOnly}>
        <Chips items={mobileItems} selected={mobileRound?.key ?? ''} onSelect={setMobileSel} label={t('roundsLabel')} />
        {mobileRound ? <ListView round={mobileRound} t={t} leagueStageLabel={leagueStageLabel} onShowStandings={onShowStandings} /> : null}
      </div>
    </div>
  );
}
