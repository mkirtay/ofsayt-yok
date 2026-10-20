import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn, useSession } from 'next-auth/react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/game';
import { useNow } from '@/hooks/useNow';
import { GAME_BRAND } from '@/config/brand';
import { MAX_GOALS } from '@/lib/game/scoring';
import type { Match } from '@/models/liveScore';
import type { GameSlot } from '@/server/game/matchSlot';
import { formatLeft } from './format';
import styles from './game.module.scss';

type Pick = { home: number | null; away: number | null };
type MeLike = { predictions: { gameMatchId: string; home: number; away: number }[] };

/** /tahmin'deki girişsiz taslakla aynı anahtar (WeekPlay `game:draft:<anahtar>`). */
const draftKey = (key: string) => `game:draft:${key}`;

function readDraft(key: string, id: string): Pick | null {
  try {
    const raw = window.localStorage.getItem(draftKey(key));
    const p = raw ? (JSON.parse(raw) as { picks?: Record<string, Pick> }).picks?.[id] : null;
    return p ?? null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, id: string, pick: Pick) {
  try {
    const raw = window.localStorage.getItem(draftKey(key));
    const cur = raw ? (JSON.parse(raw) as { picks?: Record<string, Pick>; joker?: string | null }) : {};
    window.localStorage.setItem(draftKey(key), JSON.stringify({ ...cur, picks: { ...(cur.picks ?? {}), [id]: pick } }));
  } catch {
    /* gizli pencere vb. */
  }
}

/**
 * Maç sayfasında "Bu maç {{game}}'nde · skorunu tahmin et": iki skor kutusu + Kaydet. Kart yeri SSR'da (server/game/matchSlot.ts)
 * → ilk boyamada yerinde (CLS yok); kişisel tahmin girişliyse istemcide tek istekle (`…/me`). Kayıt haftalık listedeyse haftalık,
 * değilse günlük uçla (iki listedeyse tek tahmin iki oyunda sayılır). Girişsiz: doldur → kaydederken giriş, dönüşte taslak geri.
 */
export default function MatchGameCard({ slot, match }: { slot: GameSlot; match: Match }) {
  const { t } = useTranslation('game');
  const { status } = useSession();
  const now = useNow(30_000);
  const roundKey = slot.weekKey ?? slot.dayKey!;
  const api = slot.weekKey ? `/api/game/weeks/${slot.weekKey}` : `/api/game/days/${slot.dayKey}`;
  const [pick, setPick] = useState<Pick>({ home: null, away: null });
  const [saved, setSaved] = useState<Pick | null>(null);
  const [state, setState] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const left = now != null ? Date.parse(slot.kickoffAt) - now : null;
  const locked = left != null && left <= 0;

  useEffect(() => {
    if (status === 'loading') return;
    let cancelled = false;
    const draft = readDraft(roundKey, slot.gameMatchId);
    if (status !== 'authenticated') {
      void Promise.resolve().then(() => !cancelled && draft && setPick(draft));
      return () => {
        cancelled = true;
      };
    }
    fetch(`${api}/me`, { credentials: 'include' })
      .then((r) => (r.ok ? (r.json() as Promise<MeLike>) : null))
      .then((me) => {
        if (cancelled) return;
        const p = me?.predictions.find((x) => x.gameMatchId === slot.gameMatchId);
        if (p) setSaved({ home: p.home, away: p.away });
        setPick(draft ?? (p ? { home: p.home, away: p.away } : { home: null, away: null }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [status, api, roundKey, slot.gameMatchId]);

  const set = (side: 'home' | 'away', v: number | null) => {
    setState(null);
    setPick((p) => {
      const next = { ...p, [side]: v == null ? null : Math.max(0, Math.min(MAX_GOALS, v)) };
      if (status !== 'authenticated') writeDraft(roundKey, slot.gameMatchId, next);
      return next;
    });
  };

  const complete = pick.home != null && pick.away != null;
  const dirty = complete && (!saved || saved.home !== pick.home || saved.away !== pick.away);

  const save = async () => {
    if (!complete) return;
    if (status !== 'authenticated') {
      writeDraft(roundKey, slot.gameMatchId, pick);
      void signIn('google', { callbackUrl: window.location.pathname });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${api}/predictions`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ gameMatchId: slot.gameMatchId, home: pick.home, away: pick.away }] }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: string; items?: { ok: boolean }[] };
      if (res.status === 403 && data.code === 'NICKNAME_REQUIRED') {
        setState({ tone: 'info', text: t('matchCard.needNick') });
        return;
      }
      if (!res.ok || !data.items?.[0]?.ok) {
        setState({ tone: 'error', text: data.items?.[0] && !data.items[0].ok ? t('matchCard.locked') : t('week.error') });
        return;
      }
      setSaved(pick);
      try {
        window.localStorage.removeItem(draftKey(roundKey));
      } catch {
        /* yok say */
      }
      setState({ tone: 'ok', text: t('week.saved') });
    } catch {
      setState({ tone: 'error', text: t('week.error') });
    } finally {
      setBusy(false);
    }
  };

  const home = match.home?.name ?? '';
  const away = match.away?.name ?? '';
  const both = !!slot.weekKey && !!slot.dayKey;

  return (
    <section className={styles.matchGame} aria-labelledby="match-game-title">
      <div className={styles.matchGameHead}>
        <h2 id="match-game-title" className={styles.matchGameTitle}>
          {t('matchCard.title')}
        </h2>
        <span className={styles.matchGameMeta}>
          {both ? t('both.badge') : slot.weekKey ? t('day.tabWeek') : t('day.tab')}
          {left != null && !locked ? ` · ${t('week.lockIn', { left: formatLeft(left, t) })}` : ''}
        </span>
      </div>
      {locked ? (
        <p className={styles.matchGameLocked}>{saved ? t('matchCard.yourPick', { score: `${saved.home}-${saved.away}` }) : t('matchCard.lockedNoPick')}</p>
      ) : (
        <div className={styles.matchGameRow}>
          <MiniGoal label={`${home}: ${t('week.home')}`} team={home} value={pick.home} onChange={(v) => set('home', v)} />
          <span className={styles.colon} aria-hidden="true">
            :
          </span>
          <MiniGoal label={`${away}: ${t('week.away')}`} team={away} value={pick.away} onChange={(v) => set('away', v)} />
          <button type="button" className={styles.btn} disabled={busy || !complete || (status === 'authenticated' && !dirty)} onClick={() => void save()}>
            {status === 'unauthenticated' ? t('matchCard.loginSave') : busy ? t('week.saving') : saved && !dirty ? t('week.saved') : t('week.save')}
          </button>
        </div>
      )}
      <p className={styles.matchGameFoot}>
        <span className={styles.status} data-tone={state?.tone ?? 'info'} role="status">
          {state?.text ?? ''}
        </span>
        <Link href={`${GAME_BRAND.basePath}?oyun=${slot.weekKey ? 'haftalik' : 'gunluk'}#hafta`}>{t('matchCard.all')} →</Link>
      </p>
    </section>
  );
}

function MiniGoal({ label, team, value, onChange }: { label: string; team: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <span className={styles.miniGoal}>
      <span className={styles.miniGoalTeam} aria-hidden="true">
        {team}
      </span>
      <span className={styles.miniGoalCtl}>
        <button type="button" aria-label={`${label} −`} onClick={() => onChange(value == null ? 0 : value - 1)} disabled={value == null || value <= 0}>
          −
        </button>
        <input
          className={styles.goal}
          inputMode="numeric"
          pattern="[0-9]*"
          aria-label={label}
          placeholder="?"
          value={value ?? ''}
          data-filled={value != null ? '' : undefined}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            onChange(v === '' ? null : Number(v));
          }}
        />
        <button type="button" aria-label={`${label} +`} onClick={() => onChange((value ?? -1) + 1)} disabled={value != null && value >= MAX_GOALS}>
          +
        </button>
      </span>
    </span>
  );
}
