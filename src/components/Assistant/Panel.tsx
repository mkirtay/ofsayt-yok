/**
 * AI Asistan paneli — ✦ balona / header menüsüne tıklanınca `import()` ile yüklenir (ilk yüke girmez).
 * Masaüstünde düdüğün kenarında kart; mobilde tam ekran. Sohbet geçmişi yalnız bu sekmede (sessionStorage) tutulur.
 * Model metni DÜZ metin olarak çizilir (HTML/markdown yok); linkler ve kartlar yalnız sunucunun gönderdiği olaylardan.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useI18n, useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/assistant';
import { useCredits } from '@/hooks/useCredits';
import { openKuralKosesi } from '@/components/KuralKosesi/openEvent';
import type { AssistantCard as CardData } from '@/server/assistant/tools';
import type { AssistantMatchRef } from '@/server/assistant/matchAnalysisRequest';
import { isAllowedLinkHref, RULES_PANEL_HREF, type AssistantLink } from '@/server/assistant/outputFilter';
import AssistantCard from './AssistantCard';
import { readSse } from './sse';
import styles from './assistant.module.scss';

export type AssistantPanelProps = { open: boolean; side?: 'left' | 'right'; onClose: () => void };

type Notice = { kind: 'quota' | 'budget' | 'unavailable' | 'rate' | 'refused' | 'error'; tier?: string; limit?: number };
type Message = { id: number; role: 'user' | 'assistant'; text: string; cards: CardData[]; links: AssistantLink[]; notice?: Notice; pending?: boolean };

const STORAGE_KEY = 'oy_assistant_chat_v1';
const MAX_CHARS = 300;
const CHIPS = ['today', 'standings', 'live', 'rule', 'analysis', 'credits'] as const;

function loadMessages(): Message[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Message[]) : [];
    return Array.isArray(list) ? list.filter((m) => !m.pending).slice(-20) : [];
  } catch {
    return [];
  }
}

export default function AssistantPanel({ open, side = 'right', onClose }: AssistantPanelProps) {
  const { t } = useTranslation('assistant');
  const { locale } = useI18n();
  const { asPath } = useRouter();
  const { apply: applyCredits, refresh: refreshCredits } = useCredits();
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [unlocking, setUnlocking] = useState<number | null>(null);
  const [unlockError, setUnlockError] = useState<Record<number, 'insufficient' | 'error'>>({});
  const nextId = useRef(messages.reduce((n, m) => Math.max(n, m.id), 0) + 1);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => !m.pending)));
    } catch {
      // depolama yok: geçmiş yalnız bellekte
    }
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: number, fn: (m: Message) => Message) => setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m))), []);

  const ask = useCallback(
    async (text: string) => {
      const question = text.trim().slice(0, MAX_CHARS);
      if (!question || busy) return;
      const userMsg: Message = { id: nextId.current++, role: 'user', text: question, cards: [], links: [] };
      const replyId = nextId.current++;
      const history = [...messages.filter((m) => !m.notice && m.text), userMsg].slice(-6).map((m) => ({ role: m.role, content: m.text }));
      setMessages((list) => [...list, userMsg, { id: replyId, role: 'assistant', text: '', cards: [], links: [], pending: true }]);
      setBusy(true);
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, locale, page: asPath }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { code?: string; tier?: string; limit?: number };
          const kind: Notice['kind'] = body.code === 'QUOTA' ? 'quota' : body.code === 'BUDGET' ? 'budget' : body.code === 'UNAVAILABLE' ? 'unavailable' : body.code === 'RATE' ? 'rate' : 'error';
          patch(replyId, (m) => ({ ...m, pending: false, notice: { kind, tier: body.tier, limit: body.limit } }));
          return;
        }
        await readSse(res.body, ({ event, data }) => {
          if (event === 'delta') patch(replyId, (m) => ({ ...m, text: m.text + String((data as { text?: unknown }).text ?? '') }));
          else if (event === 'card') patch(replyId, (m) => ({ ...m, cards: [...m.cards, data as CardData].slice(-3) }));
          else if (event === 'links') patch(replyId, (m) => ({ ...m, links: (data as AssistantLink[]).filter((l) => isAllowedLinkHref(l?.href)).slice(0, 4) }));
          else if (event === 'refused') patch(replyId, (m) => ({ ...m, text: '', cards: [], links: [], notice: { kind: 'refused' } }));
          else if (event === 'error') patch(replyId, (m) => (m.text ? m : { ...m, notice: { kind: 'error' } }));
          else if (event === 'done') setRemaining(Number((data as { remaining?: unknown }).remaining ?? NaN));
        });
        patch(replyId, (m) => ({ ...m, pending: false, ...(m.text || m.cards.length || m.notice ? {} : { notice: { kind: 'error' as const } }) }));
      } catch {
        patch(replyId, (m) => ({ ...m, pending: false, ...(m.text ? {} : { notice: { kind: 'error' as const } }) }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [asPath, busy, locale, messages, patch],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput('');
    void ask(text);
  };

  /** "1 kredi ile aç": mevcut analiz ucu; başarılıysa kart sunucudan özet olarak yenilenir. */
  const onUnlock = useCallback(
    async (messageId: number, match: AssistantMatchRef) => {
      setUnlocking(match.id);
      setUnlockError(({ [match.id]: _drop, ...rest }) => rest);
      try {
        const res = await fetch(`/api/matches/${match.id}/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: 'credit' }) });
        const body = (await res.json().catch(() => ({}))) as { credits?: unknown };
        if (!res.ok) {
          setUnlockError((e) => ({ ...e, [match.id]: res.status === 402 ? 'insufficient' : 'error' }));
          void refreshCredits();
          return;
        }
        if (typeof body.credits === 'number') applyCredits(body.credits);
        else void refreshCredits();
        const cardRes = await fetch('/api/assistant/analysis-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ match }) });
        if (!cardRes.ok) return;
        const { card } = (await cardRes.json()) as { card: Extract<CardData, { type: 'analysis' }>['card'] };
        patch(messageId, (m) => ({ ...m, cards: m.cards.map((c) => (c.type === 'analysis' && 'match' in c.card && c.card.match.id === match.id ? { type: 'analysis', card } : c)) }));
      } catch {
        setUnlockError((e) => ({ ...e, [match.id]: 'error' }));
      } finally {
        setUnlocking(null);
      }
    },
    [applyCredits, patch, refreshCredits],
  );

  const noticeText = (n: Notice) =>
    n.kind === 'quota' ? t(`quota.${n.tier === 'guest' || n.tier === 'premium' ? n.tier : 'user'}`, { limit: n.limit ?? '' }) : t(n.kind);

  return (
    <aside className={`${styles.panel} ${side === 'left' ? styles.panelLeft : ''} ${open ? styles.panelOpen : ''}`} role="dialog" aria-label={t('title')} aria-hidden={!open}>
      <div className={styles.head}>
        <span className={styles.spark} aria-hidden="true">✦</span>
        <div className={styles.titles}>
          <strong>{t('title')}</strong>
          <span>{remaining != null && Number.isFinite(remaining) ? t('remaining', { n: Math.max(0, remaining) }) : t('subtitle')}</span>
        </div>
        <button type="button" className={styles.close} aria-label={t('close')} onClick={onClose}>
          ✕
        </button>
      </div>
      <div ref={logRef} className={styles.log} aria-live="polite">
        <p className={styles.text}>{t('intro')}</p>
        {messages.length === 0 ? (
          <div className={styles.chips}>
            {CHIPS.map((c) => (
              <button key={c} type="button" className={styles.chip} disabled={busy} onClick={() => void ask(t(`chips.${c}`))}>
                {t(`chips.${c}`)}
              </button>
            ))}
          </div>
        ) : null}
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className={styles.user}>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={styles.reply}>
              {m.pending && !m.text && !m.cards.length ? <p className={styles.muted}>{t('thinking')}</p> : null}
              {m.text ? <p className={styles.text}>{m.text}</p> : null}
              {m.cards.map((card, i) => (
                <AssistantCard
                  key={i}
                  card={card}
                  t={t}
                  actions={{
                    onChoose: (match) => void ask(`${match.home} – ${match.away}`),
                    onUnlock: (match) => void onUnlock(m.id, match),
                    unlocking: card.type === 'analysis' && 'match' in card.card && unlocking === card.card.match.id,
                    unlockError: card.type === 'analysis' && 'match' in card.card ? (unlockError[card.card.match.id] ?? null) : null,
                  }}
                />
              ))}
              {m.notice ? (
                <p className={styles.notice}>
                  {noticeText(m.notice)}{' '}
                  {m.notice.kind === 'unavailable' || (m.notice.kind === 'quota' && m.notice.tier === 'guest') ? (
                    <Link href="/auth/signin" className={styles.link}>
                      {t('signIn')}
                    </Link>
                  ) : m.notice.kind === 'quota' && m.notice.tier === 'user' ? (
                    <Link href="/credits" className={styles.link}>
                      {t('premium')}
                    </Link>
                  ) : null}
                </p>
              ) : null}
              {m.links.length ? (
                <div className={styles.links}>
                  {m.links.map((l) =>
                    l.href === RULES_PANEL_HREF ? (
                      <button
                        key={l.href}
                        type="button"
                        className={styles.linkChip}
                        onClick={() => {
                          onClose();
                          openKuralKosesi();
                        }}
                      >
                        {l.label}
                      </button>
                    ) : (
                      <Link key={l.href} href={l.href} className={styles.linkChip}>
                        {l.label} →
                      </Link>
                    ),
                  )}
                </div>
              ) : null}
              {!m.pending && m.text ? <small className={styles.muted}>{t('dataNote')}</small> : null}
            </div>
          ),
        )}
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        <input
          ref={inputRef}
          className={styles.input}
          value={input}
          maxLength={MAX_CHARS}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('placeholder')}
          aria-label={t('placeholder')}
          enterKeyHint="send"
        />
        {busy ? (
          <button type="button" className={styles.send} onClick={() => abortRef.current?.abort()}>
            {t('stop')}
          </button>
        ) : (
          <button type="submit" className={styles.send} disabled={!input.trim()}>
            {t('send')}
          </button>
        )}
      </form>
    </aside>
  );
}
