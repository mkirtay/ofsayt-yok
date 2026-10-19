/** Tahmin oyunu API şekilleri (istemci + sunucu; JSON — tarihler ISO metin). */
export type GameTeamView = { id: number; name: string; shortName: string | null; logo: string | null };

export type GameMatchStatusView = 'SCHEDULED' | 'FINISHED' | 'VOID';

export type GameMatchView = {
  id: string;
  fixtureId: string;
  position: number;
  /** UTC ISO. Kilit bu anda (sunucuda veritabanı saatiyle); istemci yalnız gösterim için kendi saatiyle hesaplar. */
  kickoffAt: string;
  status: GameMatchStatusView;
  home: GameTeamView;
  away: GameTeamView;
  /** Normal süre sonucu (sonuçlanınca). */
  result: { home: number; away: number } | null;
  /** Maç sayfası bağlantısı. */
  href: string;
  /** Maçın listeleri: ikisi de doluysa tek tahmin iki oyunda sayılır ("Haftalık + Günlük" rozeti). */
  weekKey: string | null;
  dayKey: string | null;
};

export type GameWeekView = {
  weekKey: string;
  season: string;
  status: 'PUBLISHED' | 'SETTLED';
  startsAt: string;
  endsAt: string;
  matches: GameMatchView[];
};

/** Günlük oyun ("Günün 3 maçı"): İstanbul günü; joker yok. */
export type GameDayView = {
  dayKey: string;
  status: 'PUBLISHED' | 'SETTLED';
  startsAt: string;
  endsAt: string;
  matches: GameMatchView[];
};

import type { Breakdown } from './scoring';

export type { Breakdown };

/** `points`: haftalık (joker dahil), `basePoints`: günlük (jokersiz). */
export type MyPredictionView = { gameMatchId: string; home: number; away: number; points: number | null; basePoints: number | null; breakdown: Breakdown | null };

export type MyWeekView = {
  weekKey: string;
  nickname: string | null;
  /** Sıralamada görünür mü (takma ad + doğrulanmış e-posta)? */
  visible: boolean;
  jokerGameMatchId: string | null;
  predictions: MyPredictionView[];
  totalPoints: number;
  rank: number | null;
};

export type BoardEntryView = { rank: number; nickname: string; points: number; exact: number; direction: number };

export type BoardScope = 'week' | 'season' | 'day';

export type LeaderboardView = { scope: BoardScope; key: string; entries: BoardEntryView[] };

export type MyStandingView = {
  scope: BoardScope;
  key: string;
  points: number;
  exact: number;
  rank: number | null;
  visible: boolean;
  /** Hemen üstümdeki oyuncuyla puan farkı (lider ya da sırasızsam null). */
  gap: number | null;
  /** Art arda tahmin yapılan yayındaki hafta (günlükte: gün) sayısı (lib/game/week.ts → weekStreak). */
  streak: number;
};

export type DistributionView = {
  total: number;
  shares: { home: number; draw: number; away: number };
  /** En çok tahmin edilen skorlar (ilk 6). */
  top: { score: string; pct: number }[];
};

/** PUT /predictions kalem sonucu. */
export type SaveItemResult = { gameMatchId: string; ok: boolean; code?: 'LOCKED' | 'INVALID' };
export type SaveResult = { items: SaveItemResult[]; joker: { ok: boolean; code?: 'LOCKED' } | null; me: MyWeekView };

/** Günlük oyunda kendi günüm. */
export type MyDayView = {
  dayKey: string;
  nickname: string | null;
  visible: boolean;
  predictions: MyPredictionView[];
  totalPoints: number;
  rank: number | null;
};

/** Günlük PUT sonucu (joker yok). */
export type DaySaveResult = { items: SaveItemResult[]; me: MyDayView };
