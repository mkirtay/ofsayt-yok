import { useEffect, useRef, useState } from 'react';
import TeamLogo from '@/components/TeamLogo';
import { useI18n, useTranslation } from '@/lib/i18n';
import type { EntitySearchMatch, EntitySearchResult } from '@/lib/gundem/entitySearch';
import type { GundemEntityRef } from '@/types/gundem';
import styles from './entityPicker.module.scss';

/** Seçilen varlık + seçicide görünen önizleme (yalnız istemci; sunucu kartı id'den kendisi üretir). */
export type PickedEntity = GundemEntityRef & { label: string; image: string | null };

export type EntityPickerProps = {
  onPick: (entity: PickedEntity) => void;
  onClose: () => void;
};

const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
const EMPTY: EntitySearchResult = { players: [], teams: [], matches: [] };

function matchTime(m: EntitySearchMatch, locale: string): string {
  if (!m.startingAt) return '';
  return new Date(m.startingAt).toLocaleString(locale, {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Gönderiye oyuncu / takım / maç ekleme seçicisi (composer'ın içinde açılır; ilk kullanımda yüklenir). Boş aramada
 * bugünün maçları; yazınca `GET /api/gundem/entities/search` (300 ms gecikmeli, önceki istek iptal). Esc kapatır.
 */
export default function EntityPicker({ onPick, onClose }: EntityPickerProps) {
  const { t } = useTranslation('gundem');
  const { locale: uiLocale } = useI18n();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<EntitySearchResult | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('loading');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_CHARS;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (tooShort) return;
    const ctrl = new AbortController();
    const handle = window.setTimeout(
      async () => {
        setState('loading');
        try {
          const res = await fetch(`/api/gundem/entities/search?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setResult((await res.json()) as EntitySearchResult);
          setState('idle');
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setState('error');
        }
      },
      trimmed ? DEBOUNCE_MS : 0,
    );
    return () => {
      ctrl.abort();
      window.clearTimeout(handle);
    };
  }, [trimmed, tooShort]);

  const r = tooShort ? EMPTY : (result ?? EMPTY);
  const total = r.players.length + r.teams.length + r.matches.length;
  const locale = uiLocale === 'en' ? 'en-GB' : 'tr-TR';

  return (
    <div
      className={styles.picker}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.searchRow}>
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="search"
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('entity.searchPlaceholder')}
          aria-label={t('entity.searchLabel')}
          autoComplete="off"
          maxLength={40}
        />
        <button type="button" className={styles.close} onClick={onClose} aria-label={t('entity.close')} title={t('entity.close')}>
          ×
        </button>
      </div>
      <div className={styles.results} aria-live="polite" aria-busy={state === 'loading'}>
        {tooShort ? (
          <p className={styles.note}>{t('entity.minChars')}</p>
        ) : state === 'error' ? (
          <p className={styles.note}>{t('entity.searchError')}</p>
        ) : state === 'loading' && !result ? (
          <p className={styles.note}>{t('entity.searching')}</p>
        ) : total === 0 && state === 'idle' ? (
          <p className={styles.note}>{t('entity.noResults')}</p>
        ) : (
          <>
            {r.matches.length ? (
              <Group title={trimmed ? t('entity.matches') : t('entity.todayMatches')}>
                {r.matches.map((m) => (
                  <Item
                    key={`m${m.id}`}
                    onClick={() => onPick({ type: 'MATCH', id: m.id, label: `${m.home.name} – ${m.away.name}`, image: m.home.logo })}
                  >
                    <span className={styles.pair}>
                      <TeamLogo src={m.home.logo} width={16} alt="" className={styles.logo} />
                      <TeamLogo src={m.away.logo} width={16} alt="" className={styles.logo} />
                    </span>
                    <span className={styles.text}>
                      <span className={styles.name}>
                        {m.home.name} – {m.away.name}
                      </span>
                      <span className={styles.meta}>{[m.league, matchTime(m, locale)].filter(Boolean).join(' · ')}</span>
                    </span>
                  </Item>
                ))}
              </Group>
            ) : null}
            {r.players.length ? (
              <Group title={t('entity.players')}>
                {r.players.map((p) => (
                  <Item key={`p${p.id}`} onClick={() => onPick({ type: 'PLAYER', id: p.id, label: p.name, image: p.photo })}>
                    <TeamLogo src={p.photo} width={24} alt="" className={styles.photo} fallback={<span className={styles.photoPh} />} />
                    <span className={styles.name}>{p.name}</span>
                  </Item>
                ))}
              </Group>
            ) : null}
            {r.teams.length ? (
              <Group title={t('entity.teams')}>
                {r.teams.map((tm) => (
                  <Item key={`t${tm.id}`} onClick={() => onPick({ type: 'TEAM', id: tm.id, label: tm.name, image: tm.logo })}>
                    <TeamLogo src={tm.logo} width={22} alt="" className={styles.logo} fallback={<span className={styles.photoPh} />} />
                    <span className={styles.name}>{tm.name}</span>
                  </Item>
                ))}
              </Group>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={styles.group} role="group" aria-label={title}>
      <div className={styles.groupTitle}>{title}</div>
      {children}
    </div>
  );
}

function Item({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={styles.item} onClick={onClick}>
      {children}
    </button>
  );
}
