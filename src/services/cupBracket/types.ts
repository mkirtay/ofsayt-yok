/**
 * Kupa eleme ağacı modeli (sunucuda `stages/seasons/{id}` yanıtından üretilir, istemciye JSON olarak gider).
 * Bkz. services/cupBracket/buildCupBracket.ts (dönüştürücü) ve config/cupBrackets.ts (kupa başına tur şablonu).
 */

/** Ağaçtaki tur yuvası (şablon). Erken turlar / ön elemeler yuvasızdır (`null`). */
export type BracketSlot = 'ko_po' | 'r16' | 'qf' | 'sf' | 'final';

export type CupTeam = { id: number; name: string; logo: string | null };

/** Bir maç (ayak). Skorlar maçın KENDİ ev sahibi / deplasmanına göre; `homeId` tie'nin hangi takımı olduğunu söyler. */
export type CupLeg = {
  fixtureId: number;
  /** UTC ISO ("2026-05-30T16:00:00Z"); bilinmiyorsa null. */
  startingAt: string | null;
  stateId: number;
  homeId: number | null;
  awayId: number | null;
  /** Normal süre + uzatma (Sportmonks CURRENT); başlamamışsa null. */
  homeGoals: number | null;
  awayGoals: number | null;
  /** Penaltı atışları (varsa). */
  pens?: { home: number; away: number };
};

export type CupTie = {
  /** `agg-{aggregateId}` | `fx-{fixtureId}` | `tbd-{slot}-{i}`. */
  id: string;
  /** İlk maçın ev sahibi (iki ayakta toplam skor bu sırayla). Kurası çekilmemiş kutuda null. */
  home: CupTeam | null;
  away: CupTeam | null;
  /** Başlama sırasına göre (1. ayak önce). */
  legs: CupLeg[];
  /** İki ayaklı eşleşmede toplam (en az bir ayak bittiyse); `final` = bütün ayaklar bitti. Tie'nin home/away sırasıyla. */
  agg?: { home: number; away: number; final: boolean };
  /** Eşleşmeyi bitiren penaltılar (tie'nin home/away sırasıyla). */
  pens?: { home: number; away: number };
  /** Nasıl bitti: uzatma, penaltı, hükmen. Normal sürede bittiyse yok. */
  decidedBy?: 'et' | 'pen' | 'awarded';
  winnerId: number | null;
  /** Kazananın gideceği eşleşme (sonraki tur). */
  nextTieId: string | null;
};

export type CupRoundStatus = 'done' | 'current' | 'upcoming' | 'tbd';

export type CupRound = {
  /** Benzersiz anahtar: yuvalı turda yuva adı, değilse `stage-{id}`. */
  key: string;
  stageId: number | null;
  /** Sportmonks aşama adı (İngilizce); yerelleştirme istemcide `slot` / `nameKey` ile. */
  name: string;
  slot: BracketSlot | null;
  /** `qualifying` = ön eleme (type 225), `early` = ağaç öncesi eleme turu, `bracket` = ağaç turu. */
  kind: 'qualifying' | 'early' | 'bracket';
  status: CupRoundStatus;
  ties: CupTie[];
};

export type CupBracket = {
  leagueId: number;
  seasonId: number;
  /** Lig / grup aşaması (varsa) — puan durumu sekmesine bağlantı için. */
  leagueStage: { stageId: number; name: string; kind: 'league' | 'group' } | null;
  /** Ön eleme + erken turlar (zaman sırasıyla), ardından ağaç turları (şablon sırasıyla). */
  rounds: CupRound[];
};
