import Head from "next/head";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutoSizer } from "react-virtualized-auto-sizer";
import { List, type RowComponentProps } from "react-window";

import Button from "@/components/Button";
import Layout from "@/components/Layout";
import MatchCard from "@/components/MatchCard";
import {
  getLiveMatches,
  getTeamsFromMatchesData,
} from "@/services/liveScoreService";
import { startLiveUpdates } from "@/services/realtime/liveUpdates";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { mergeMatches, setMatches } from "@/store/slices/matchesSlice";
import { setTeams } from "@/store/slices/teamsSlice";
import { setMatchFilter } from "@/store/slices/uiSlice";
import styles from "./index.module.scss";

export default function Home() {
  const dispatch = useAppDispatch();
  const matches = useAppSelector((state) => state.matches.items);
  const filter = useAppSelector((state) => state.ui.matchFilter);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("list");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const previousScores = useRef(new Map<string, string>());
  const rowHeights = useRef(new Map<number, number>());
  const [rowHeightsVersion, setRowHeightsVersion] = useState(0);

  useEffect(() => {
    const bootstrap = async () => {
      const data = await getLiveMatches();
      dispatch(setMatches(data));
      const teams = getTeamsFromMatchesData(data);
      dispatch(setTeams(teams));
    };

    if (matches.length === 0) {
      bootstrap();
    }
  }, [dispatch, matches.length]);

  useEffect(() => {
    const controller = startLiveUpdates(
      async () => {
        const data = await getLiveMatches();
        const changed = data
          .filter((match) => {
            const prev = previousScores.current.get(match.id);
            const next = `${match.score.home}-${match.score.away}`;
            previousScores.current.set(match.id, next);
            return prev !== undefined && prev !== next;
          })
          .map((match) => match.id);

        if (changed.length > 0) {
          setHighlightedIds(changed);
          setTimeout(() => setHighlightedIds([]), 2000);
        }

        dispatch(mergeMatches(data));
        return true;
      },
      {
        initialDelayMs: 30000,
        minDelayMs: 15000,
        maxDelayMs: 60000,
        onUpdateTimestamp: (timestamp) => setLastUpdated(timestamp),
      }
    );

    return () => controller.stop();
  }, [dispatch]);

  const filteredMatches = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (filter === "live") {
      return matches.filter((match) => {
        const isLive = match.status !== "FT";
        if (!normalizedSearch) {
          return isLive;
        }
        const combined = `${match.homeTeam.name} ${match.awayTeam.name}`.toLowerCase();
        return isLive && combined.includes(normalizedSearch);
      });
    }
    if (filter === "finished") {
      return matches.filter((match) => {
        const isFinished = match.status === "FT";
        if (!normalizedSearch) {
          return isFinished;
        }
        const combined = `${match.homeTeam.name} ${match.awayTeam.name}`.toLowerCase();
        return isFinished && combined.includes(normalizedSearch);
      });
    }
    if (!normalizedSearch) {
      return matches;
    }
    return matches.filter((match) => {
      const combined = `${match.homeTeam.name} ${match.awayTeam.name}`.toLowerCase();
      return combined.includes(normalizedSearch);
    });
  }, [matches, filter, search]);

  const groupedMatches = useMemo(() => {
    const normalize = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const top5Order = [
      { key: "england", match: (country: string, competition: string) =>
          normalize(country).includes("england") ||
          normalize(competition).includes("premier league"),
      },
      { key: "spain", match: (country: string, competition: string) =>
          normalize(country).includes("spain") ||
          normalize(competition).includes("la liga"),
      },
      { key: "germany", match: (country: string, competition: string) =>
          normalize(country).includes("germany") ||
          normalize(competition).includes("bundesliga"),
      },
      { key: "italy", match: (country: string, competition: string) =>
          normalize(country).includes("italy") ||
          normalize(competition).includes("serie a"),
      },
      { key: "france", match: (country: string, competition: string) =>
          normalize(country).includes("france") ||
          normalize(competition).includes("ligue 1"),
      },
    ];

    const isUefa = (competition: string) => {
      const normalized = normalize(competition);
      return (
        normalized.includes("uefa champions league") ||
        normalized.includes("uefa europa league") ||
        normalized.includes("uefa conference league") ||
        normalized.includes("champions league") ||
        normalized.includes("europa league") ||
        normalized.includes("conference league")
      );
    };

    const getPriority = (country: string, competition: string) => {
      const normalizedCountry = normalize(country);
      if (normalizedCountry.includes("turkiye") || normalizedCountry.includes("turkey")) {
        return 0;
      }

      const top5Index = top5Order.findIndex((entry) =>
        entry.match(country, competition)
      );
      if (top5Index !== -1) {
        return top5Index + 1;
      }

      if (isUefa(competition)) {
        return 20;
      }

      return 99;
    };

    const map = new Map<
      string,
      { label: string; matches: typeof filteredMatches; priority: number }
    >();

    filteredMatches.forEach((match) => {
      const country = match.league?.country ?? "Other";
      const competition = match.league?.competition ?? "Unknown";
      const label = `${country} - ${competition}`;
      const key = `${country}::${competition}`;
      const entry = map.get(key);
      if (entry) {
        entry.matches.push(match);
      } else {
        map.set(key, {
          label,
          matches: [match],
          priority: getPriority(country, competition),
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.label.localeCompare(b.label);
    });
  }, [filteredMatches]);

  const listItems = useMemo(() => {
    const items: Array<
      | { type: "header"; label: string }
      | { type: "match"; matchId: string; match: (typeof filteredMatches)[number] }
    > = [];

    groupedMatches.forEach((group) => {
      items.push({ type: "header", label: group.label });
      group.matches.forEach((match) => {
        items.push({ type: "match", matchId: match.id, match });
      });
    });

    return items;
  }, [groupedMatches]);

  const setRowHeight = useCallback((index: number, size: number) => {
    const next = Math.ceil(size);
    const prev = rowHeights.current.get(index);
    if (prev !== next) {
      rowHeights.current.set(index, next);
      setRowHeightsVersion((value) => value + 1);
    }
  }, []);

  const getRowHeight = useCallback(
    (index: number) => {
      const cached = rowHeights.current.get(index);
      if (cached) {
        return cached;
      }
      return listItems[index].type === "header" ? 24 : 74;
    },
    [listItems, rowHeightsVersion]
  );

  const Row = ({
    index,
    style,
    ariaAttributes,
    items,
    highlightedIds: rowHighlightedIds,
    setRowHeight: setRowHeightForRow,
  }: RowComponentProps<{
    items: typeof listItems;
    highlightedIds: string[];
    setRowHeight: (index: number, size: number) => void;
  }>) => {
    const item = items[index];
    const rowRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      const node = rowRef.current;
      if (!node) {
        return;
      }

      const measure = () => {
        const nextHeight = node.getBoundingClientRect().height;
        setRowHeightForRow(index, nextHeight);
      };

      measure();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(() => {
        measure();
      });
      observer.observe(node);

      return () => observer.disconnect();
    }, [index, setRowHeightForRow]);

    if (item.type === "header") {
      return (
        <div style={style} className={styles.virtualRow} {...ariaAttributes}>
          <div ref={rowRef} className={styles.leagueHeader}>
            {item.label}
          </div>
        </div>
      );
    }
    return (
      <div style={style} className={styles.virtualRow} {...ariaAttributes}>
        <div ref={rowRef} className={styles.leagueRow}>
          <MatchCard
            match={item.match}
            compact
            isHighlighted={rowHighlightedIds.includes(item.matchId)}
          />
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Live Scores</title>
        <meta name="description" content="Canlı maç skorları ve detaylar" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Layout
        activeNav="live"
        searchValue={search}
        onSearchChange={(value) => setSearch(value)}
      >
        <div className={styles.page}>
          <header className={styles.header}>
            <div className={styles.headerCard}>
              <div className={styles.filters}>
                <Button
                  variant="ghost"
                  isActive={filter === "all"}
                  onClick={() => dispatch(setMatchFilter("all"))}
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  isActive={filter === "live"}
                  onClick={() => dispatch(setMatchFilter("live"))}
                >
                  Live
                </Button>
                <Button
                  variant="ghost"
                  isActive={filter === "finished"}
                  onClick={() => dispatch(setMatchFilter("finished"))}
                >
                  Finished
                </Button>
              </div>
              <div className={styles.viewToggle}>
                <Button
                  variant="ghost"
                  isActive={view === "list"}
                  onClick={() => setView("list")}
                >
                  List
                </Button>
                <Button
                  variant="ghost"
                  isActive={view === "grid"}
                  onClick={() => setView("grid")}
                >
                  Grid
                </Button>
              </div>
            </div>
          </header>
          <main className={styles.main}>
            <div className={styles.sectionHeader}>
              <h2>Ongoing matches</h2>
              <span>
                {filteredMatches.length} matches
                {lastUpdated && (
                  <span className={styles.updatedAt}>
                    · updated {Math.floor((Date.now() - lastUpdated) / 1000)}s ago
                  </span>
                )}
              </span>
            </div>
            <div
              className={`${styles.cardGrid} ${
                view === "grid" ? styles.grid : styles.list
              }`}
            >
              {view === "grid" &&
                groupedMatches.map((group) => (
                  <section key={group.label} className={styles.leagueGroup}>
                    <h3 className={styles.leagueHeader}>{group.label}</h3>
                    <div className={styles.leagueGrid}>
                      {group.matches.map((match) => (
                        <MatchCard
                          key={match.id}
                          match={match}
                          isHighlighted={highlightedIds.includes(match.id)}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              {view === "list" && (
                <div className={styles.virtualList}>
                  <AutoSizer
                    renderProp={({ height, width }) => (
                      <List
                        className={styles.virtualListContent}
                        rowCount={listItems.length}
                        rowHeight={getRowHeight}
                        rowComponent={Row}
                        rowProps={{
                          items: listItems,
                          highlightedIds,
                          setRowHeight,
                        }}
                        style={{ height: height ?? 0, width: width ?? 0 }}
                        defaultHeight={420}
                      />
                    )}
                  />
                </div>
              )}
            </div>
            {filteredMatches.length === 0 && (
              <p className={styles.empty}>Bu filtre için maç yok.</p>
            )}
          </main>
        </div>
      </Layout>
    </>
  );
}
