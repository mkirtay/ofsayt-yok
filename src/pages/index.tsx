import { useCallback, useEffect, useState } from 'react';
import { getLiveMatches, getMatchesByDate, groupMatchesByLeague } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import MatchList from '@/components/MatchList';
import Container from '@/components/Container';
import styles from './index.module.scss';

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'live' | 'date'>('live');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    const res =
      mode === 'live'
        ? await getLiveMatches(page)
        : await getMatchesByDate(selectedDate, page);
    setMatches(res.matches);
    setTotalPages(res.totalPages);
    setLoading(false);
  }, [mode, selectedDate, page]);

  useEffect(() => {
    fetchMatches();
    if (mode === 'live') {
      const interval = setInterval(fetchMatches, 30000);
      return () => clearInterval(interval);
    }
    return;
  }, [fetchMatches, mode]);

  const grouped = groupMatchesByLeague(matches);

  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <Container>
      <div className={styles.pageHeader}>
        <h1>Canlı Maç Sonuçları</h1>
        <span className={styles.count}>
          {totalPages > 1 ? `Sayfa ${page} / ${totalPages} · ` : null}
          {matches.length} maç
        </span>
      </div>
      <div className={styles.filters}>
        <div className={styles.modeSwitch}>
          <button
            className={mode === 'live' ? styles.active : ''}
            onClick={() => {
              setMode('live');
              setPage(1);
            }}
          >
            Canlı
          </button>
          <button
            className={mode === 'date' ? styles.active : ''}
            onClick={() => {
              setMode('date');
              setPage(1);
            }}
          >
            Tarihe Göre
          </button>
        </div>
        {mode === 'date' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setPage(1);
            }}
            className={styles.dateInput}
          />
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>Yükleniyor...</div>
      ) : (
        <>
          <MatchList groupedMatches={grouped} />
          {totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Sayfa">
              <button
                type="button"
                className={styles.pageBtn}
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Önceki
              </button>
              <span className={styles.pageInfo}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className={styles.pageBtn}
                disabled={!canNext}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki
              </button>
            </nav>
          ) : null}
        </>
      )}
    </Container>
  );
}
