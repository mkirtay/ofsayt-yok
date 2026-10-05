/**
 * Kural Köşesi panelinin "Asistan" sekmesi — şimdilik yalnız maç analizi istekleri (LLM yok, yeni üretim yok).
 * Panel sekmeye geçince yerel `import()` ile yüklenir (ilk yükte değil).
 * "1 kredi ile aç" yalnız HAZIR (kilitli) analizde görünür ve mevcut maç analizi ucunu (`POST
 * /api/matches/[id]/analysis`) çağırır; başarılıysa özet asistandan yeniden istenir.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/kuralKosesi';
import { useCredits } from '@/hooks/useCredits';
import type { AssistantAnalysisCard, AssistantMatchRef } from '@/server/assistant/matchAnalysisRequest';
import AssistantCard from './AssistantCard';
import styles from './assistant.module.scss';

type Message = { id: number; role: 'user' | 'assistant'; text?: string; card?: AssistantAnalysisCard; error?: boolean };

async function askAssistant(body: { text: string } | { match: AssistantMatchRef }): Promise<AssistantAnalysisCard> {
  const res = await fetch('/api/assistant/analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { card: AssistantAnalysisCard }).card;
}

export default function AssistantTab() {
  const { t } = useTranslation('kuralKosesi');
  const { apply: applyCredits, refresh: refreshCredits } = useCredits();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [unlocking, setUnlocking] = useState<number | null>(null);
  const [unlockError, setUnlockError] = useState<Record<number, 'insufficient' | 'error'>>({});
  const nextId = useRef(1);

  const push = (m: Omit<Message, 'id'>) => setMessages((list) => [...list, { ...m, id: nextId.current++ }]);

  const respond = async (body: { text: string } | { match: AssistantMatchRef }) => {
    setBusy(true);
    try {
      push({ role: 'assistant', card: await askAssistant(body) });
    } catch {
      push({ role: 'assistant', error: true });
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    push({ role: 'user', text });
    void respond({ text });
  };

  const onChoose = (match: AssistantMatchRef) => {
    push({ role: 'user', text: `${match.home} – ${match.away}` });
    void respond({ match });
  };

  const onUnlock = async (match: AssistantMatchRef) => {
    setUnlocking(match.id);
    setUnlockError((e) => {
      const { [match.id]: _, ...rest } = e;
      return rest;
    });
    try {
      const res = await fetch(`/api/matches/${match.id}/analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'credit' }),
      });
      const body = (await res.json().catch(() => ({}))) as { credits?: unknown };
      if (!res.ok) {
        setUnlockError((e) => ({ ...e, [match.id]: res.status === 402 ? 'insufficient' : 'error' }));
        void refreshCredits();
        return;
      }
      if (typeof body.credits === 'number') applyCredits(body.credits);
      else void refreshCredits();
      // Tam analiz istemciye bu yanıtla geldi ama sohbette yalnız özet gösterilir: asistandan yeniden iste.
      push({ role: 'assistant', card: await askAssistant({ match }) });
    } catch {
      setUnlockError((e) => ({ ...e, [match.id]: 'error' }));
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.log} aria-live="polite">
        <p className={styles.text}>{t('assistant.intro')}</p>
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className={styles.user}>
              {m.text}
            </p>
          ) : m.error || !m.card ? (
            <p key={m.id} className={styles.error}>
              {t('assistant.error')}
            </p>
          ) : (
            <AssistantCard
              key={m.id}
              card={m.card}
              t={t}
              actions={{
                onChoose,
                onUnlock: (match) => void onUnlock(match),
                unlocking: 'match' in m.card && unlocking === m.card.match.id,
                unlockError: 'match' in m.card ? (unlockError[m.card.match.id] ?? null) : null,
              }}
            />
          ),
        )}
        {busy ? <p className={styles.muted}>{t('assistant.thinking')}</p> : null}
      </div>
      <form className={styles.form} onSubmit={onSubmit}>
        <input
          className={styles.input}
          value={input}
          maxLength={200}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('assistant.placeholder')}
          aria-label={t('assistant.placeholder')}
        />
        <button type="submit" className={styles.send} disabled={busy || !input.trim()}>
          {t('assistant.send')}
        </button>
      </form>
    </div>
  );
}
