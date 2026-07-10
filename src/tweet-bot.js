const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const LIVE_SCORE_BASE = 'https://livescore-api.com/api-client';

/** LiveScore `event` alanı — yalnızca bunlar işlenir */
const RELEVANT_EVENT_TYPES = new Set([
  'GOAL',
  'GOAL_PENALTY',
  'OWN_GOAL',
  'RED_CARD',
  'YELLOW_RED_CARD',
  'MISSED_PENALTY',
]);

/** Tweet 1. satır başlığı (ör. GOL | …) */
const EVENT_TWEET_HEADLINE = {
  GOAL: 'GOL',
  GOAL_PENALTY: 'PENALTIDAN GOL',
  OWN_GOAL: 'KKS',
  RED_CARD: 'KIRMIZI KART',
  YELLOW_RED_CARD: 'IKINCI SARI',
  MISSED_PENALTY: 'KACIRILAN PENALTI',
};

/**
 * Takip edilecek takımlar — `competitionId` LiveScore lig/kupa id (src/config/leagues.ts ile uyumlu)
 * Türkiye için aynı takım hem lig (6) hem Türkiye Kupası (347) ayrı satırda izlenir.
 */
const TEAMS = [
  // Türkiye — Süper Lig
  { id: 669,  competitionId: 6, name: 'Galatasaray' },
  { id: 866,  competitionId: 6, name: 'Fenerbahçe' },
  { id: 144,  competitionId: 6, name: 'Beşiktaş' },
  { id: 1404, competitionId: 6, name: 'Trabzonspor' },
  // Türkiye — Türkiye Kupası
  { id: 669,  competitionId: 347, name: 'Galatasaray' },
  { id: 866,  competitionId: 347, name: 'Fenerbahçe' },
  { id: 144,  competitionId: 347, name: 'Beşiktaş' },
  { id: 1404, competitionId: 347, name: 'Trabzonspor' },
  // İngiltere — Premier League
  { id: 18,   competitionId: 2, name: 'Arsenal' },
  { id: 7,    competitionId: 2, name: 'Liverpool' },
  { id: 12,   competitionId: 2, name: 'Manchester City' },
  { id: 19,   competitionId: 2, name: 'Manchester United' },
  // Almanya — Bundesliga
  { id: 46,   competitionId: 1, name: 'Bayern München' },
  { id: 41,   competitionId: 1, name: 'Borussia Dortmund' },
  // İspanya — La Liga
  { id: 21,   competitionId: 3, name: 'Barcelona' },
  { id: 27,   competitionId: 3, name: 'Real Madrid' },
  // İtalya — Serie A
  { id: 81,   competitionId: 4, name: 'Inter' },
  { id: 85,   competitionId: 4, name: 'Milan' },
  { id: 80,   competitionId: 4, name: 'Napoli' },
  { id: 79,   competitionId: 4, name: 'Juventus' },
  // Fransa — Ligue 1
  { id: 59,   competitionId: 5, name: 'PSG' },
  // Şampiyonlar Ligi — LiveScore `competition_id` = 244 (245 = Avrupa Ligi; bkz. src/config/leagues.ts)
  { id: 669,  competitionId: 244, name: 'Galatasaray' },
  { id: 866,  competitionId: 244, name: 'Fenerbahçe' },
  { id: 144,  competitionId: 244, name: 'Beşiktaş' },
  { id: 1404, competitionId: 244, name: 'Trabzonspor' },
  { id: 18,   competitionId: 244, name: 'Arsenal' },
  { id: 7,    competitionId: 244, name: 'Liverpool' },
  { id: 12,   competitionId: 244, name: 'Manchester City' },
  { id: 19,   competitionId: 244, name: 'Manchester United' },
  { id: 46,   competitionId: 244, name: 'Bayern München' },
  { id: 41,   competitionId: 244, name: 'Borussia Dortmund' },
  { id: 21,   competitionId: 244, name: 'Barcelona' },
  { id: 27,   competitionId: 244, name: 'Real Madrid' },
  { id: 81,   competitionId: 244, name: 'Inter' },
  { id: 85,   competitionId: 244, name: 'Milan' },
  { id: 80,   competitionId: 244, name: 'Napoli' },
  { id: 79,   competitionId: 244, name: 'Juventus' },
  { id: 59,   competitionId: 244, name: 'PSG' },
];

/**
 * TEST MODE — tek maça odaklı, düşük maliyetli test için.
 * `TWEET_BOT_TEST_MODE=true` set edilirse yukarıdaki 37 satırlık tam liste yerine
 * sadece bu (küçük) liste poll edilir → API çağrısı 37 satırdan 1'e düşer.
 * Buraya test etmek istediğin maçın tek bir takımını eklemen yeterli; events.json
 * o maçın TÜM olaylarını (her iki takım dahil) zaten döndürür.
 *
 * Örnek: 2026 Dünya Kupası, Fransa - Fas (competition_id=362, France team_id=1439).
 */
const TEST_TEAMS = [
  { id: 1439, competitionId: 362, name: 'France' },
];

const TEST_MODE = String(process.env.TWEET_BOT_TEST_MODE || '').toLowerCase().trim() === 'true';
const ACTIVE_TEAMS = TEST_MODE ? TEST_TEAMS : TEAMS;

/** Tweet ikinci hashtag (lig) */
const COMPETITION_TWEET = {
  1: { tag: 'Bundesliga' },
  2: { tag: 'PremierLeague' },
  3: { tag: 'LaLiga' },
  4: { tag: 'SerieA' },
  5: { tag: 'Ligue1' },
  6: { tag: 'SüperLig' },
  244: { tag: 'ChampionsLeague' },
  347: { tag: 'TurkiyeKupasi' },
  362: { tag: 'DünyaKupası' },
};

/** match_id (string) → maç durumu (kickoff / FT için) */
const previousState = new Map();
/** match_id (string) → işlenmiş olay anahtarı Set (id veya sentetik) */
const processedEventIds = new Map();
/** TEAMS satırı anahtarı → son görülen matchKey (maç bitince state temizliği) */
const teamActiveMatchKey = new Map();

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

const STATE_VERSION = 3;
const DEFAULT_STATE_PATH = path.join(process.cwd(), '.data', 'tweet-bot-state.json');
const STATE_PATH = String(process.env.TWEET_BOT_STATE_PATH || '').trim() || DEFAULT_STATE_PATH;
const MAX_EVENT_KEYS_PER_MATCH = Number(process.env.TWEET_BOT_MAX_EVENT_KEYS || 250) || 250;
const MATCH_STATE_TTL_DAYS = Number(process.env.TWEET_BOT_MATCH_TTL_DAYS || 7) || 7;

/** @type {{ version: number, matches: Record<string, any>, teamActiveMatchKey: Record<string, string>, teamUpcomingFixture: Record<string, string> }} */
let persistedState = { version: STATE_VERSION, matches: {}, teamActiveMatchKey: {}, teamUpcomingFixture: {} };

async function loadPersistedState() {
  try {
    const raw = await fsp.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const version = Number(parsed.version) || STATE_VERSION;
    const matches = parsed.matches && typeof parsed.matches === 'object' ? parsed.matches : {};
    const tak = parsed.teamActiveMatchKey && typeof parsed.teamActiveMatchKey === 'object' ? parsed.teamActiveMatchKey : {};
    const tuf =
      parsed.teamUpcomingFixture && typeof parsed.teamUpcomingFixture === 'object'
        ? parsed.teamUpcomingFixture
        : {};
    persistedState = { version, matches, teamActiveMatchKey: tak, teamUpcomingFixture: tuf };
  } catch (e) {
    // Dosya yoksa ilk çalıştırma kabul edilir.
  }

  // Persist edilmiş state'i belleğe hydrate et.
  for (const [rowKey, matchKey] of Object.entries(persistedState.teamActiveMatchKey)) {
    if (typeof matchKey === 'string' && matchKey) teamActiveMatchKey.set(rowKey, matchKey);
  }
  for (const [matchKey, m] of Object.entries(persistedState.matches)) {
    if (!m || typeof m !== 'object') continue;
    const seenArr = Array.isArray(m.seenEventKeys) ? m.seenEventKeys : [];
    processedEventIds.set(matchKey, new Set(seenArr.filter((x) => typeof x === 'string')));
    if (m.lastStatus || m.lastMinute || m.lastScore) {
      previousState.set(matchKey, {
        status: m.lastStatus || '',
        minute: m.lastMinute || '',
        score: m.lastScore || '',
      });
    }
  }
}

async function savePersistedState() {
  const dir = path.dirname(STATE_PATH);
  fs.mkdirSync(dir, { recursive: true });

  // Version bump: eski dosyadan yüklense bile yeni şema ile kaydet.
  persistedState.version = STATE_VERSION;

  // Prune eski maçlar (dosya şişmesin)
  const now = Date.now();
  const ttlMs = MATCH_STATE_TTL_DAYS * 24 * 60 * 60 * 1000;
  for (const [matchKey, m] of Object.entries(persistedState.matches)) {
    const updatedAt = typeof m?.updatedAt === 'number' ? m.updatedAt : 0;
    if (updatedAt && now - updatedAt > ttlMs) {
      delete persistedState.matches[matchKey];
    }
  }

  const tmp = `${STATE_PATH}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(persistedState), 'utf8');
  await fsp.rename(tmp, STATE_PATH);
}

function ensurePersistedMatch(matchKey) {
  if (!persistedState.matches[matchKey]) {
    persistedState.matches[matchKey] = {
      kickoffTweeted: false,
      htTweeted: false,
      ftTweeted: false,
      sawFixtureBeforeLive: false,
      seenEventKeys: [],
      // Gol benzeri olaylar için ikinci (zaman-bağımsız) dedup katmanı — bkz. goalSignature().
      goalSignaturesSeen: [],
      lastStatus: '',
      lastMinute: '',
      lastScore: '',
      updatedAt: Date.now(),
    };
  }
  return persistedState.matches[matchKey];
}

function rememberEventKey(matchKey, key) {
  if (!key) return;
  const m = ensurePersistedMatch(matchKey);
  if (!Array.isArray(m.seenEventKeys)) m.seenEventKeys = [];
  m.seenEventKeys.push(key);
  if (m.seenEventKeys.length > MAX_EVENT_KEYS_PER_MATCH) {
    m.seenEventKeys = m.seenEventKeys.slice(-MAX_EVENT_KEYS_PER_MATCH);
  }
  m.updatedAt = Date.now();
}

function parseMinute(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = /^(\d{1,3})/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function normalizeEventTimeKey(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  const m = /^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?/.exec(s);
  if (!m) return s;
  return m[2] ? `${m[1]}+${m[2]}` : m[1];
}

function isGoalLikeEvent(evType) {
  return evType === 'GOAL' || evType === 'GOAL_PENALTY' || evType === 'OWN_GOAL';
}

function sleepMs(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayIsoUtc() {
  return new Date().toISOString().slice(0, 10);
}

const fixturesCache = new Map();

async function fetchFixturesByDateCompetition(isoDate, competitionId) {
  const { key, secret } = livescoreCredentials();
  if (!key || !secret) return [];
  try {
    const { data } = await axios.get(`${LIVE_SCORE_BASE}/fixtures/list.json`, {
      params: {
        key,
        secret,
        date: isoDate,
        competition_id: competitionId,
      },
      timeout: 10000,
    });
    if (!data?.success || !data.data) return [];
    const list = data.data.fixtures;
    if (!Array.isArray(list)) return [];
    return list;
  } catch (error) {
    logAxiosError(`fixtures/list.json (date=${isoDate} competition_id=${competitionId})`, error);
    return [];
  }
}

async function getFixturesForCompetitionCached(isoDate, competitionId) {
  const key = `${isoDate}:${competitionId}`;
  const now = Date.now();
  const cached = fixturesCache.get(key);
  if (cached && now - cached.at < 60_000) return cached.list;
  const list = await fetchFixturesByDateCompetition(isoDate, competitionId);
  fixturesCache.set(key, { at: now, list });
  return list;
}

function findTeamFixture(fixtures, teamId) {
  for (const f of fixtures || []) {
    const homeId = f?.home?.id ?? f?.home_id;
    const awayId = f?.away?.id ?? f?.away_id;
    if (String(homeId) === String(teamId) || String(awayId) === String(teamId)) return f;
  }
  return null;
}

function teamRowKey(team) {
  return `${team.competitionId}:${team.id}`;
}

function competitionTweetMeta(competitionId) {
  return COMPETITION_TWEET[competitionId] || { tag: 'Futbol' };
}

function secondHashtag(team) {
  return competitionTweetMeta(team.competitionId).tag;
}

/** Süper Lig (6) ve Türkiye Kupası (347): "Maçımız …"; diğer ligler: nötr "Maç …" */
function isTurkeySuperLig(team) {
  return team.competitionId === 6 || team.competitionId === 347;
}

function tweetFooter(team) {
  return `#${teamHashtag(team)} #${secondHashtag(team)}`;
}

function uniqueHashtags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const raw = String(t || '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function matchTweetFooter(team, match) {
  const { home, away } = getMatchTeamLabels(match);
  const tags = uniqueHashtags([teamHashtag({ name: home }), teamHashtag({ name: away }), secondHashtag(team)]);
  return tags.map((t) => `#${t}`).join(' ');
}

/** API route ile aynı isimler; bazı ortamlarda LIVE_SCORE_* kullanılmış olabilir */
function livescoreCredentials() {
  const key = process.env.LIVESCORE_API_KEY || process.env.LIVE_SCORE_API_KEY;
  const secret = process.env.LIVESCORE_API_SECRET || process.env.LIVE_SCORE_API_SECRET;
  return { key, secret };
}

function isDryRun() {
  return String(process.env.DRY_RUN || '').toLowerCase().trim() === 'true';
}

let twitterV2Singleton = null;
function getTwitterV2() {
  if (!twitterV2Singleton) {
    const twitterClient = new TwitterApi({
      appKey: process.env.X_API_KEY,
      appSecret: process.env.X_API_SECRET,
      accessToken: process.env.X_ACCESS_TOKEN,
      accessSecret: process.env.X_ACCESS_TOKEN_SECRET,
    });
    twitterV2Singleton = twitterClient.v2;
  }
  return twitterV2Singleton;
}

function logAxiosError(label, error) {
  const status = error.response?.status;
  const body = error.response?.data;
  const snippet =
    body !== undefined
      ? (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 400)
      : '';
  log(`❌ ${label}: ${error.message}${status ? ` [HTTP ${status}]` : ''}${snippet ? ` — ${snippet}` : ''}`);
}

function teamHashtag(team) {
  return team.name.replace(/\s/g, '');
}

/**
 * MatchList ile aynı öncelik: scores.score → score; ft yedek.
 * @see src/components/MatchList/index.tsx (scoreRaw)
 */
function getMatchScoreLine(match) {
  if (!match || typeof match !== 'object') return '?-?';
  const raw = match.scores?.score ?? match.scores?.ft_score ?? match.score;
  if (raw != null && String(raw).trim() !== '') {
    return String(raw).trim();
  }
  return '?-?';
}

/** Skor metnini "1-0" biçimine yaklaştır (API bazen "1 - 0" döner) */
function normalizeScoreDisplay(score) {
  if (score == null || String(score).trim() === '') return '?-?';
  return String(score).replace(/\s*[-–]\s*/g, '-').trim();
}

/** LiveScore / UI ile uyum: IN PLAY, HALF TIME BREAK, FINISHED, FT … */
function normalizeMatchStatus(status) {
  return String(status || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function isHalfTimeBreak(status) {
  const s = normalizeMatchStatus(status);
  if (!s) return false;
  if (s === 'HALF TIME BREAK') return true;
  if (s === 'HT') return true;
  if (s === 'HALFTIME' || s === 'HALF TIME') return true;
  return false;
}

/** Devre arası skoru — öncelik `ht_score` (web’deki İY skoru) */
function getHalfTimeScoreLine(match) {
  if (!match || typeof match !== 'object') return '?-?';
  const ht = match.scores?.ht_score;
  if (ht != null && String(ht).trim() !== '') {
    return normalizeScoreDisplay(String(ht).trim());
  }
  return normalizeScoreDisplay(getMatchScoreLine(match));
}


/**
 * Liste/detay sayfalarıyla uyum: nested team adı önce (fixtures/canlı farklı şekillerde döner).
 * @see src/components/MatchList/index.tsx
 */
function getMatchTeamLabels(match) {
  if (!match || typeof match !== 'object') {
    return { home: 'Ev sahibi', away: 'Deplasman' };
  }
  const home = match.home?.name || match.home_name || 'Ev sahibi';
  const away = match.away?.name || match.away_name || 'Deplasman';
  return { home, away };
}

function normalizeMatchList(payload) {
  const raw = payload?.data?.match;
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * getMatchWithEvents: events.json hem `event` hem `match` döner; skor burada daha güncel olabilir.
 * @see src/services/liveScoreService.ts getMatchWithEvents
 */
function mergeLiveMatchWithEventsDetail(live, detail) {
  if (!detail || typeof detail !== 'object') return live;
  return {
    ...live,
    ...detail,
    scores: detail.scores ?? live.scores,
    home: detail.home ?? live.home,
    away: detail.away ?? live.away,
    home_name: detail.home_name ?? live.home_name,
    away_name: detail.away_name ?? live.away_name,
  };
}

function normalizeEventList(raw) {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/**
 * İstekler arası stabil kanonik anahtar:
 * - `id` ve `sort` alanları API’de sonradan değişebildiğinden anahtara dahil edilmez
 * - `match_id` öneki ile farklı maçlardaki aynı dakika/oyuncu çakışmaları ayrışır
 */
function eventDedupeKey(matchKey, ev) {
  if (ev == null || typeof ev !== 'object') return null;
  const time = normalizeEventTimeKey(ev.time ?? '');
  const type = ev.event ?? '';
  const playerId = ev.player?.id ?? '';
  const playerName = String(ev.player?.name ?? '').trim().toLowerCase();
  const side = ev.is_home === true || ev.is_home === '1' ? 'H' : ev.is_away === true || ev.is_away === '1' ? 'A' : '?';
  const who = playerId || playerName || '';
  // side alanı API'de bazen tutarsız gelebiliyor; belirsizse anahtardan çıkar.
  const sideKey = side === '?' ? '' : `|${side}`;
  return `${matchKey}|${time}|${type}|${who}${sideKey}`;
}

/**
 * DUPLICATE TWEET FIX — ikinci, zaman-bağımsız dedup katmanı.
 *
 * `eventDedupeKey()` dakika bilgisini (`ev.time`) anahtara dahil eder. Sorun şu:
 * canlı skor API'si uzatma dakikalarını ("45" → "45+2" gibi) bazen olay ilk
 * geldikten SONRA düzeltiyor. Bu düzeltme olduğunda `eventDedupeKey` farklı bir
 * anahtar üretir ve olay `seen` set'inde bulunamadığı için "yeni olay" sanılır.
 * Normalde bunu `scoreChanged` kontrolü engeller (skor zaten değişmiş olduğu için
 * tekrar atlanır) — ANCAK aynı turda BAŞKA bir gol daha atılırsa (skor yine
 * değişir), bu "hayalet" eski gol de o turda skor değişmiş göründüğü için
 * gönderilebilir ve mükerrer (duplicate) tweet oluşur.
 *
 * Çözüm: gol benzeri olaylar için zamana bağlı olmayan ikinci bir imza
 * (tip + taraf + oyuncu + o anki skor) tutulur. Bu imza daha önce görülmüşse,
 * `eventDedupeKey` "yeni" dese bile tweet ATILMAZ.
 */
function goalSignature(matchKey, ev, scoreAtEvent) {
  if (ev == null || typeof ev !== 'object') return null;
  const type = ev.event ?? '';
  const playerId = ev.player?.id ?? '';
  const playerName = String(ev.player?.name ?? '').trim().toLowerCase();
  const side = ev.is_home === true || ev.is_home === '1' ? 'H' : ev.is_away === true || ev.is_away === '1' ? 'A' : '?';
  const who = playerId || playerName || '';
  const score = normalizeScoreDisplay(String(scoreAtEvent ?? ''));
  return `${matchKey}|${type}|${side}|${who}|${score}`;
}

function hasGoalSignature(pMatch, sig) {
  if (!sig) return false;
  return Array.isArray(pMatch.goalSignaturesSeen) && pMatch.goalSignaturesSeen.includes(sig);
}

function rememberGoalSignature(pMatch, sig) {
  if (!sig) return;
  if (!Array.isArray(pMatch.goalSignaturesSeen)) pMatch.goalSignaturesSeen = [];
  pMatch.goalSignaturesSeen.push(sig);
  if (pMatch.goalSignaturesSeen.length > MAX_EVENT_KEYS_PER_MATCH) {
    pMatch.goalSignaturesSeen = pMatch.goalSignaturesSeen.slice(-MAX_EVENT_KEYS_PER_MATCH);
  }
  pMatch.updatedAt = Date.now();
}

function sortEventsChronological(list) {
  return [...list].sort(
    (a, b) =>
      (Number(a.sort) || 0) - (Number(b.sort) || 0) ||
      (Number(a.time) || 0) - (Number(b.time) || 0)
  );
}

/**
 * Canlı maç — her takım kendi liginde (`competition_id` + `team_id`)
 */
async function fetchLiveMatch(teamId, competitionId) {
  const { key, secret } = livescoreCredentials();
  if (!key || !secret) {
    log('⚠️ LIVESCORE_API_KEY / LIVESCORE_API_SECRET (veya LIVE_SCORE_*) tanımlı değil');
    return null;
  }
  try {
    const { data } = await axios.get(`${LIVE_SCORE_BASE}/matches/live.json`, {
      params: {
        key,
        secret,
        competition_id: competitionId,
        team_id: teamId,
      },
      timeout: 10000,
    });

    if (!data?.success || data.data == null) {
      log(`⚠️ live.json başarısız veya boş (competition_id=${competitionId} team_id=${teamId})`);
      return null;
    }

    const matches = normalizeMatchList(data);
    if (matches.length === 0) return null;

    const m = matches[0];
    log(`📡 Canlı maç: competition_id=${competitionId} team_id=${teamId} → match_id=${m.id}`);
    return m;
  } catch (error) {
    logAxiosError(`live.json (competition_id=${competitionId} team_id=${teamId})`, error);
    return null;
  }
}

/**
 * Maç olayları + events cevabındaki match özeti
 */
async function fetchMatchEventsBundle(matchId) {
  const { key, secret } = livescoreCredentials();
  if (!key || !secret) {
    return { events: [], matchDetail: null };
  }
  try {
    const { data } = await axios.get(`${LIVE_SCORE_BASE}/matches/events.json`, {
      params: {
        key,
        secret,
        match_id: matchId,
      },
      timeout: 10000,
    });

    if (!data?.success || data.data == null) {
      return { events: [], matchDetail: null };
    }

    const matchDetail = data.data.match ?? null;
    const list = normalizeEventList(data.data.event)
      .filter((e) => e && RELEVANT_EVENT_TYPES.has(e.event));
    return { events: sortEventsChronological(list), matchDetail };
  } catch (error) {
    logAxiosError(`events.json (match_id=${matchId})`, error);
    return { events: [], matchDetail: null };
  }
}

/**
 * Olay tweet: GOL | Ev 1-0 Dep, 73' Oyuncu\n#Takım #Lig
 */
function buildEventTweet(team, match, ev) {
  const { home, away } = getMatchTeamLabels(match);
  const score = normalizeScoreDisplay(getMatchScoreLine(match));
  const dk =
    typeof ev.time === 'number' && !Number.isNaN(ev.time)
      ? String(ev.time)
      : ev.time != null
        ? String(ev.time)
        : '?';
  const oyuncu = ev.player?.name?.trim() ? ev.player.name : 'Oyuncu';
  const headline = EVENT_TWEET_HEADLINE[ev.event] || 'OLAY';

  return `${headline} | ${home} ${score} ${away}, ${dk}' ${oyuncu}\n${matchTweetFooter(team, match)}`;
}

function buildEventTweetSafe(team, match, ev, options) {
  const { home, away } = getMatchTeamLabels(match);
  const score = normalizeScoreDisplay(getMatchScoreLine(match));
  const dk =
    typeof ev.time === 'number' && !Number.isNaN(ev.time)
      ? String(ev.time)
      : ev.time != null
        ? String(ev.time)
        : '?';
  const oyuncu = ev.player?.name?.trim() ? ev.player.name : 'Oyuncu';
  const headline = EVENT_TWEET_HEADLINE[ev.event] || 'OLAY';

  const scorePart = `${home} ${score} ${away}`;
  return `${headline} | ${scorePart}, ${dk}' ${oyuncu}\n${matchTweetFooter(team, match)}`;
}

async function sendTweet(text) {
  try {
    log(`📤 Tweet gönderiliyor: "${text}"`);

    if (isDryRun()) {
      log('🧪 DRY RUN — tweet gerçekte gönderilmedi');
      return true;
    }

    await getTwitterV2().tweet(text);
    log(`✅ Tweet gönderildi!`);
    return true;
  } catch (error) {
    log(`❌ Tweet gönderilemedi: ${error.message}`);
    return false;
  }
}

/**
 * Tek sefer: devre arasına girildi (`HALF TIME BREAK` / `HT`) veya bot maçı ilk gördüğünde zaten İY'deyse.
 */
async function maybeTweetHalfTimeEnd(team, merged, homeName, awayName, pMatch, prevStatus) {
  if (pMatch.htTweeted) return;
  const cur = merged.status || '';
  const prevS = prevStatus != null ? String(prevStatus) : '';
  const enteredFromPlay =
    prevS !== '' && !isHalfTimeBreak(prevS) && isHalfTimeBreak(cur);
  const bootstrapWhileHt = prevS === '' && isHalfTimeBreak(cur);
  if (!enteredFromPlay && !bootstrapWhileHt) return;

  const htHead = 'İLK YARI BİTTİ';
  const scoreLine = getHalfTimeScoreLine(merged);
  const text = `${htHead} | ${homeName} ${scoreLine} ${awayName}\n${matchTweetFooter(team, merged)}`;

  log(`⚽ İLK YARI BİTTİ tweet (prevStatus=${prevS || '(yok)'}, status=${cur}, skor=${scoreLine})`);
  const ok = await sendTweet(text);
  if (ok) {
    pMatch.htTweeted = true;
    pMatch.updatedAt = Date.now();
  }
}

function ensureEventSet(matchKey) {
  if (!processedEventIds.has(matchKey)) {
    processedEventIds.set(matchKey, new Set());
  }
  return processedEventIds.get(matchKey);
}

async function checkAllTeams() {
  log('🔄 Kontrol başladı...');

  const isoToday = todayIsoUtc();

  for (const team of ACTIVE_TEAMS) {
    const rowKey = teamRowKey(team);
    const match = await fetchLiveMatch(team.id, team.competitionId);

    if (!match) {
      const oldKey = teamActiveMatchKey.get(rowKey);
      if (oldKey) {
        previousState.delete(oldKey);
        processedEventIds.delete(oldKey);
        teamActiveMatchKey.delete(rowKey);
      }
      delete persistedState.teamActiveMatchKey[rowKey];

      // Maç henüz başlamamış olabilir: fixtures'tan bugünkü maçı önceden yakala.
      const fixtures = await getFixturesForCompetitionCached(isoToday, team.competitionId);
      const fx = findTeamFixture(fixtures, team.id);
      if (fx?.id != null) {
        persistedState.teamUpcomingFixture[rowKey] = String(fx.id);
        const m = ensurePersistedMatch(String(fx.id));
        m.sawFixtureBeforeLive = true;
        m.updatedAt = Date.now();
      } else {
        delete persistedState.teamUpcomingFixture[rowKey];
      }

      log(`⚪ ${team.name}: Canlı maç yok`);
      continue;
    }

    const matchId = match.id;
    const matchKey = String(matchId);
    teamActiveMatchKey.set(rowKey, matchKey);
    persistedState.teamActiveMatchKey[rowKey] = matchKey;
    const upcoming = persistedState.teamUpcomingFixture[rowKey];

    const prev = previousState.get(matchKey);
    const seen = ensureEventSet(matchKey);
    const pMatch = ensurePersistedMatch(matchKey);

    const { events, matchDetail } = await fetchMatchEventsBundle(matchId);
    const merged = mergeLiveMatchWithEventsDetail(match, matchDetail);

    const { home: homeName, away: awayName } = getMatchTeamLabels(merged);
    const minute = merged.time || '?';
    const status = merged.status || '';

    /** GOL tweet’i ile aynı yapı: tek satır `BAŞLIK | …`, alt satır hashtag */
    const kickoffHead = 'MAÇ BAŞLADI';
    const ftHead = isTurkeySuperLig(team) ? 'MAÇIMIZ BİTTİ' : 'MAÇ BİTTİ';

    // İlk kez bu maçı görüyoruz → kickoff:
    // - Eğer fixtures'ta önceden gördüysek (NOT_STARTED→LIVE geçişini yakaladık), dakika kaç olursa olsun 1 kez at.
    // - Aksi halde (bot maçı ilk kez live görüyor; restart olabilir) sadece erken dakikalarda at.
    if (!prev) {
      log(`🆕 ${team.name}: Yeni maç tespit edildi (${homeName} vs ${awayName})`);

      const minuteNum = parseMinute(merged.time);
      const sawFixture = Boolean(pMatch.sawFixtureBeforeLive) || (upcoming && String(upcoming) === matchKey);
      const shouldKickoff =
        !pMatch.kickoffTweeted &&
        (sawFixture || (minuteNum != null && minuteNum <= 2)) &&
        status !== 'FT' &&
        status !== 'AET' &&
        !isHalfTimeBreak(status);

      if (shouldKickoff) {
        const kickoff = `${kickoffHead} | ${homeName} - ${awayName}\n${matchTweetFooter(team, merged)}`;
        const ok = await sendTweet(kickoff);
        if (ok) {
          pMatch.kickoffTweeted = true;
          pMatch.updatedAt = Date.now();
          delete persistedState.teamUpcomingFixture[rowKey];
        }
      } else {
        log(
          `ℹ️ Kickoff atlanıyor: kickoffTweeted=${Boolean(pMatch.kickoffTweeted)} sawFixture=${sawFixture} minute=${minuteNum} status=${status}`
        );
      }

      for (const e of events) {
        const k = eventDedupeKey(matchKey, e);
        if (k) {
          seen.add(k);
          rememberEventKey(matchKey, k);
        }
      }

      await maybeTweetHalfTimeEnd(team, merged, homeName, awayName, pMatch, '');

      previousState.set(matchKey, { status, minute, score: getMatchScoreLine(merged) });
      pMatch.lastStatus = status;
      pMatch.lastMinute = minute;
      pMatch.lastScore = getMatchScoreLine(merged);
      pMatch.updatedAt = Date.now();
      continue;
    }

    const newcomers = events
      .filter((e) => {
        const k = eventDedupeKey(matchKey, e);
        return k && !seen.has(k);
      })
      .sort(
        (a, b) =>
          (Number(a.sort) || 0) - (Number(b.sort) || 0) ||
          (Number(a.time) || 0) - (Number(b.time) || 0)
      );

    const curScore = normalizeScoreDisplay(getMatchScoreLine(merged));
    const prevScore = prev?.score ? normalizeScoreDisplay(String(prev.score)) : '';
    const scoreChanged = curScore !== prevScore;

    for (const ev of newcomers) {
      if (isGoalLikeEvent(ev.event) && !scoreChanged) {
        log(`⏳ Gol event'i var ama skor henüz değişmedi (prev=${prevScore} cur=${curScore}); tweet erteleniyor: ${ev.event} ${ev.time}' ${ev.player?.name || '?'}`);
        continue;
      }

      // DUPLICATE TWEET FIX: zaman alanı (ör. "45" → "45+2") API'de sonradan
      // düzeltildiğinde eventDedupeKey "yeni" bir olay sanabilir. Gol benzeri
      // olaylarda ikinci, zamana bağlı olmayan imzayı da kontrol ederek aynı golü
      // farklı bir zaman etiketiyle tekrar tweetlemeyi engelliyoruz.
      let sig = null;
      if (isGoalLikeEvent(ev.event)) {
        sig = goalSignature(matchKey, ev, curScore);
        if (hasGoalSignature(pMatch, sig)) {
          log(`🚫 Mükerrer gol tespit edildi (zaman alanı değişmiş olabilir), tweet atlanıyor: ${ev.event} ${ev.time}' ${ev.player?.name || '?'} skor=${curScore}`);
          const k = eventDedupeKey(matchKey, ev);
          if (k) {
            seen.add(k);
            rememberEventKey(matchKey, k);
          }
          continue;
        }
      }

      const text = buildEventTweetSafe(team, merged, ev, {});
      const ok = await sendTweet(text);
      if (ok) {
        const k = eventDedupeKey(matchKey, ev);
        if (k) {
          seen.add(k);
          rememberEventKey(matchKey, k);
        }
        if (sig) {
          rememberGoalSignature(pMatch, sig);
        }
      }
    }

    await maybeTweetHalfTimeEnd(team, merged, homeName, awayName, pMatch, prev.status || '');

    if ((status === 'FT' || status === 'AET') && prev.status !== 'FT' && prev.status !== 'AET') {
      const ft =
        `${ftHead} | ${homeName} ${normalizeScoreDisplay(getMatchScoreLine(merged))} ${awayName}\n` +
        matchTweetFooter(team, merged);

      const ok = await sendTweet(ft);
      if (ok) {
        pMatch.ftTweeted = true;
        pMatch.updatedAt = Date.now();
      }
    }

    previousState.set(matchKey, { status, minute, score: getMatchScoreLine(merged) });
    pMatch.lastStatus = status;
    pMatch.lastMinute = minute;
    pMatch.lastScore = getMatchScoreLine(merged);
    pMatch.updatedAt = Date.now();
  }

  log('✅ Kontrol tamamlandı\n');

  try {
    await savePersistedState();
  } catch (e) {
    log(`⚠️ State kaydedilemedi: ${e?.message || String(e)}`);
  }
}

async function startBot() {
  log('🤖 Ofsayt Yok Tweet Bot başlatılıyor...');
  log(`🧪 DRY_RUN modu: ${isDryRun() ? 'AÇIK (tweet gönderilmez)' : 'KAPALI (gerçek tweet)'}`);
  log(`🎯 TEST_MODE: ${TEST_MODE ? `AÇIK — sadece ${ACTIVE_TEAMS.map((t) => t.name).join(', ')} izleniyor (${ACTIVE_TEAMS.length} satır)` : `KAPALI — tam liste izleniyor (${ACTIVE_TEAMS.length} satır)`}`);
  log(`💾 State dosyası: ${STATE_PATH}`);

  await loadPersistedState();
  await checkAllTeams();

  cron.schedule('*/30 * * * * *', checkAllTeams);
  log('⏱️  Cron job kuruldu: Her 30 saniyede kontrol');
  log('🚀 Bot çalışıyor!\n');
}

startBot().catch((err) => {
  log(`🔥 Başlatma hatası: ${err.message}`);
  process.exit(1);
});

process.on('SIGTERM', () => { log('⏹️  Bot durduruluyor...'); process.exit(0); });
process.on('SIGINT',  () => { log('⏹️  Bot durduruluyor (Ctrl+C)...'); process.exit(0); });