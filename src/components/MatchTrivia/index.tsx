/**
 * Premium kullanıcılar için LLM tabanlı maç trivia paneli.
 *
 * - Premium değilse: blur preview + "Premium'a Geç" CTA
 * - Premium ise: GET /api/matches/[id]/trivia çağrılır,
 *   Ertem Şener tarzı istatistikler, bağlam anlatısı ve
 *   tarihi rekabet bilgisi gösterilir.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePremium } from '@/hooks/usePremium';
import type { Match } from '@/models/liveScore';
import styles from './matchTrivia.module.scss';

type ApiTrivia = {
  id: string;
  matchId: string;
  matchStatus: string;
  ertemFacts: string[];
  contextual: string;
  rivalryContext: string;
  modelVersion: string;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  matchId: string;
  match: Match | null;
};

function PreviewSkeleton({ homeName, awayName }: { homeName?: string; awayName?: string }) {
  return (
    <div>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Bilinmeyenler</h4>
        <ul className={styles.factsList}>
          <li className={styles.factItem}>
            Bu iki takım son 10 karşılaşmasının 7&apos;sinde en az 3 gol gördü.
          </li>
          <li className={styles.factItem}>
            {homeName ?? 'Ev sahibi'} bu statta son 5 maçında hiç beraberlik yaşamadı.
          </li>
          <li className={styles.factItem}>
            {awayName ?? 'Deplasman'} deplasmanlarında son 8 maçın 6&apos;sında gol attı.
          </li>
        </ul>
      </div>
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Tarihi Rekabet</h4>
        <p className={styles.narrative}>
          Bu iki takım arasındaki tarihi rekabet onlarca yıla yayılan...
        </p>
      </div>
    </div>
  );
}

export default function MatchTrivia({ matchId, match }: Props) {
  const { loading: premiumLoading, isPremium } = usePremium();
  const [trivia, setTrivia] = useState<ApiTrivia | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  const inFlightMatchId = useRef<string | null>(null);
  const lastFetchedMatchId = useRef<string | null>(null);

  const fetchTrivia = useCallback(
    async (force = false) => {
      if (!matchId) return;
      if (!force && lastFetchedMatchId.current === matchId) return;
      if (inFlightMatchId.current === matchId) return;

      inFlightMatchId.current = matchId;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/matches/${matchId}/trivia`);
        if (res.status === 401 || res.status === 403) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? 'Bu özellik premium üyelere özeldir.');
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `İstek başarısız (${res.status})`);
        }
        const body = (await res.json()) as { trivia: ApiTrivia };
        setTrivia(body.trivia);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Trivia alınamadı');
      } finally {
        lastFetchedMatchId.current = matchId;
        inFlightMatchId.current = null;
        setLoading(false);
        setHasFetched(true);
      }
    },
    [matchId]
  );

  useEffect(() => {
    if (premiumLoading || !isPremium || !matchId) return;
    if (lastFetchedMatchId.current === matchId) return;
    if (inFlightMatchId.current === matchId) return;
    void fetchTrivia();
  }, [premiumLoading, isPremium, matchId, fetchTrivia]);

  if (premiumLoading) {
    return (
      <div className={styles.card}>
        <div className={styles.loading}>Yükleniyor…</div>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Trivia & Bilinmeyenler
          </h3>
        </div>
        <div className={styles.lockedWrap}>
          <div className={styles.lockedPreview}>
            <PreviewSkeleton homeName={match?.home?.name} awayName={match?.away?.name} />
          </div>
          <div className={styles.lockedOverlay}>
            <h4 className={styles.lockedTitle}>🔒 Premium Üyelere Özel</h4>
            <p className={styles.lockedSubtitle}>
              Ertem Şener tarzı istatistikler, transfer bağlamı ve tarihi rekabet bilgisi
              için Premium üyeliğe geç.
            </p>
            <Link href="/premium" className={styles.ctaButton}>
              Premium&apos;a Geç
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading && !trivia) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Trivia & Bilinmeyenler
          </h3>
        </div>
        <div className={styles.loading}>
          Trivia hazırlanıyor… Bu işlem birkaç saniye sürebilir.
        </div>
      </div>
    );
  }

  if (error && !trivia) {
    return (
      <div className={styles.card}>
        <div className={styles.headerRow}>
          <h3 className={styles.title}>
            <span className={styles.aiBadge}>AI</span>
            Maç Trivia & Bilinmeyenler
          </h3>
        </div>
        <div className={styles.errorBox}>
          {error}
          {hasFetched && (
            <div>
              <button
                type="button"
                className={styles.generateBtn}
                onClick={() => void fetchTrivia(true)}
                disabled={loading}
              >
                Tekrar Dene
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!trivia) return null;

  const facts = Array.isArray(trivia.ertemFacts) ? trivia.ertemFacts : [];

  return (
    <div className={styles.card}>
      <div className={styles.headerRow}>
        <h3 className={styles.title}>
          <span className={styles.aiBadge}>AI</span>
          Maç Trivia & Bilinmeyenler
        </h3>
      </div>

      {/* Ertem Şener Tarzı İstatistikler */}
      {facts.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Bilinmeyenler</h4>
          <ul className={styles.factsList}>
            {facts.map((fact, i) => (
              <li key={i} className={styles.factItem}>
                <span className={styles.factIcon}>⚡</span>
                {fact}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Bağlamsal Anlatı */}
      {trivia.contextual && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Sahada Bağlam</h4>
          <p className={styles.narrative}>{trivia.contextual}</p>
        </div>
      )}

      {/* Tarihi Rekabet */}
      {trivia.rivalryContext && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Tarihi Rekabet</h4>
          <p className={styles.narrative}>{trivia.rivalryContext}</p>
        </div>
      )}
    </div>
  );
}
