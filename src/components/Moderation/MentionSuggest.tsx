import { useEffect, useId, useState, type RefObject } from 'react';
import { useTranslation } from '@/lib/i18n';
import '@/lib/i18nNamespaces/moderation';
import { activeMentionQuery } from '@/utils/mentions';
import { searchMentionCandidates, type MentionCandidate } from './api';
import styles from './moderation.module.scss';

export type MentionSuggestProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  /** Seçilen kullanıcı adı metne yazılır: yeni değer + imleç konumu. */
  onPick: (value: string, caret: number) => void;
};

const DEBOUNCE_MS = 200;

/**
 * @etiket önerisi (yazı alanı + liste = ARIA 1.2 combobox). İmlecin önünde "@ab" varken 200 ms sonra
 * GET /api/gundem/users/search (yalnız var olan, silinmemiş, iki yönde engelsiz kullanıcılar). Klavye: ↓/↑ seçenekler,
 * Enter / Tab seçer, Esc kapatır (Ctrl/Cmd+Enter gönderimi etkilenmez). Sonuç sayısı ekran okuyucuya duyurulur.
 * PostComposer bunu ilk odakta yükler (yerel import()) → ilk sayfa yüküne girmez.
 */
export default function MentionSuggest({ textareaRef, value, onPick }: MentionSuggestProps) {
  const { t } = useTranslation('moderation');
  const listId = useId();
  const [caret, setCaret] = useState(value.length);
  const [results, setResults] = useState<Record<string, MentionCandidate[]>>({});
  const [activeFor, setActiveFor] = useState<{ key: string; index: number }>({ key: '', index: 0 });
  // Esc ile kapatılan ya da odak dışına çıkılan sorgu: aynı sorguda liste yeniden açılmaz (yazmaya devam edince açılır).
  const [closedFor, setClosedFor] = useState<string | null>(null);

  const found = activeMentionQuery(value, caret);
  const key = found ? found.query.toLowerCase() : '';
  const items = found && key !== closedFor ? (results[key] ?? null) : null;
  const open = items !== null;
  const active = activeFor.key === key && items ? Math.min(activeFor.index, Math.max(0, items.length - 1)) : 0;

  // İmleç konumu: yazma, tıklama ve ok tuşlarıyla değişir; odak çıkınca liste kapanır.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const sync = () => {
      setCaret(el.selectionStart ?? 0);
      setClosedFor(null);
    };
    const hide = () => setClosedFor(activeMentionQuery(el.value, el.selectionStart ?? 0)?.query.toLowerCase() ?? null);
    const move = (e: KeyboardEvent) => {
      if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') setCaret(el.selectionStart ?? 0);
    };
    el.addEventListener('input', sync);
    el.addEventListener('click', sync);
    el.addEventListener('keyup', move);
    el.addEventListener('blur', hide);
    return () => {
      el.removeEventListener('input', sync);
      el.removeEventListener('click', sync);
      el.removeEventListener('keyup', move);
      el.removeEventListener('blur', hide);
    };
  }, [textareaRef]);

  // Sonuçlar sorgu başına önbellekte; yoksa 200 ms bekleyip sunucudan (önceki istek iptal).
  useEffect(() => {
    if (!key || results[key]) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      searchMentionCandidates(key, ctrl.signal)
        .then((r) => setResults((prev) => ({ ...prev, [key]: r.items })))
        .catch(() => undefined);
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, results]);

  // Combobox ARIA'sı yazı alanının kendisinde.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const expanded = open && items.length > 0;
    el.setAttribute('role', 'combobox');
    el.setAttribute('aria-autocomplete', 'list');
    el.setAttribute('aria-controls', listId);
    el.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (expanded) el.setAttribute('aria-activedescendant', `${listId}-${active}`);
    else el.removeAttribute('aria-activedescendant');
  }, [textareaRef, listId, open, items, active]);

  function pick(c: MentionCandidate) {
    if (!found) return;
    const before = value.slice(0, found.start);
    const after = value.slice(caret).replace(/^\s/, '');
    const insert = `@${c.username} `;
    setClosedFor(key);
    setCaret(before.length + insert.length);
    onPick(before + insert + after, before.length + insert.length);
  }

  // Seçim tuşları yalnız liste açıkken yakalanır (capture: composer'ın Enter / Ctrl+Enter davranışından önce).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (!open || !items) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setClosedFor(key);
        return;
      }
      if (!items.length || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveFor({ key, index: (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        pick(items[active]!);
      }
    }
    el.addEventListener('keydown', onKey, true);
    return () => el.removeEventListener('keydown', onKey, true);
  });

  return (
    <>
      <span className={styles.srOnly} aria-live="polite">
        {open ? (items.length ? t('mention.results', { count: items.length }) : t('mention.noResults')) : ''}
      </span>
      {open ? (
        <ul id={listId} role="listbox" aria-label={t('mention.listLabel')} className={styles.suggest}>
          {items.length === 0 ? (
            <li className={styles.empty} role="presentation">
              {t('mention.noResults')}
            </li>
          ) : (
            items.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`${styles.option} ${i === active ? styles.optionActive : ''}`.trim()}
                onMouseDown={(e) => {
                  e.preventDefault(); // odak yazı alanında kalsın
                  pick(c);
                }}
                onMouseEnter={() => setActiveFor({ key, index: i })}
              >
                <span>@{c.username}</span>
                {c.name ? <span className={styles.optionName}>{c.name}</span> : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </>
  );
}
