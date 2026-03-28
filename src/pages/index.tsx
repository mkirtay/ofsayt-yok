import { useEffect, useState } from 'react';
import { getLiveMatches, getMatchesByDate, groupMatchesByLeague } from '@/services/liveScoreService';
import { Match } from '@/models/liveScore';
import MatchList from '@/components/MatchList';
import Container from '@/components/Container';
import styles from './index.module.scss';

export default function Home() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'live' | 'date'>('live');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const data = mode === 'live' ? await getLiveMatches() : await getMatchesByDate(selectedDate);
      setMatches(data);
      setLoading(false);
    };

    fetchMatches();
    if (mode === 'live') {
      const interval = setInterval(fetchMatches, 30000);
      return () => clearInterval(interval);
    }
    return;
  }, [mode, selectedDate]);

  const grouped = groupMatchesByLeague(matches);

  return (
    <Container>
      <div className={styles.pageHeader}>
        <h1>Canlı Maç Sonuçları</h1>
        <span className={styles.count}>{matches.length} maç</span>
      </div>
      <div className={styles.filters}>
        <div className={styles.modeSwitch}>
          <button
            className={mode === 'live' ? styles.active : ''}
            onClick={() => setMode('live')}
          >
            Canlı
          </button>
          <button
            className={mode === 'date' ? styles.active : ''}
            onClick={() => setMode('date')}
          >
            Tarihe Göre
          </button>
        </div>
        {mode === 'date' && (
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className={styles.dateInput}
          />
        )}
      </div>

      {loading ? (
        <div className={styles.loading}>Yükleniyor...</div>
      ) : (
        <MatchList groupedMatches={grouped} />
      )}
    </Container>
  );
}
