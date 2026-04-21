const cron = require('node-cron');
const { TwitterApi } = require('twitter-api-v2');
const axios = require('axios');

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
 * Takip edilecek takımlar — `competitionId` LiveScore lig id (src/config/leagues.ts ile uyumlu)
 */
const TEAMS = [
  { id: 669,  competitionId: 6, name: 'Galatasaray' },
  { id: 866,  competitionId: 6, name: 'Fenerbahçe' },
  { id: 144,  competitionId: 6, name: 'Beşiktaş' },
  { id: 1404, competitionId: 6, name: 'Trabzonspor' },
  { id: 18,   competitionId: 2, name: 'Arsenal' },
  { id: 7,    competitionId: 2, name: 'Liverpool' },
  { id: 12,   competitionId: 2, name: 'Manchester City' },
  { id: 19,   competitionId: 2, name: 'Manchester United' },
  { id: 46,   competitionId: 1, name: 'Bayern München' },
  { id: 41,   competitionId: 1, name: 'Borussia Dortmund' },
  { id: 21,   competitionId: 3, name: 'Barcelona' },
  { id: 27,   competitionId: 3, name: 'Real Madrid' },
  { id: 81,   competitionId: 4, name: 'Inter' },
  { id: 85,   competitionId: 4, name: 'Milan' },
  { id: 80,   competitionId: 4, name: 'Napoli' },
  { id: 79,   competitionId: 4, name: 'Juventus' },
  { id: 59,   competitionId: 5, name: 'PSG' },
];

/** Tweet ikinci hashtag (lig) */
const COMPETITION_TWEET = {
  1: { tag: 'Bundesliga' },
  2: { tag: 'PremierLeague' },
  3: { tag: 'LaLiga' },
  4: { tag: 'SerieA' },
  5: { tag: 'Ligue1' },
  6: { tag: 'SüperLig' },
};

/** match_id (string) → maç durumu (kickoff / FT için) */
const previousState = new Map();
/** match_id (string) → işlenmiş olay anahtarı Set (id veya sentetik) */
const processedEventIds = new Map();
/** TEAMS satırı anahtarı → son görülen matchKey (maç bitince state temizliği) */
const teamActiveMatchKey = new Map();

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

function teamRowKey(team) {
  return `${team.competitionId}:${team.id}`;
}

function competitionTweetMeta(competitionId) {
  return COMPETITION_TWEET[competitionId] || { tag: 'Futbol' };
}

function secondHashtag(team) {
  return competitionTweetMeta(team.competitionId).tag;
}

/** Süper Lig (6): "Maçımız …"; diğer ligler: nötr "Maç …" */
function isTurkeySuperLig(team) {
  return team.competitionId === 6;
}

function tweetFooter(team) {
  return `#${teamHashtag(team)} #${secondHashtag(team)}`;
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

/** API bazen id vermez; tekrarlayan tweet’i önlemek için sentetik anahtar */
function eventDedupeKey(ev) {
  if (ev == null || typeof ev !== 'object') return null;
  if (ev.id != null && ev.id !== '') return `id:${ev.id}`;
  return `syn:${ev.sort ?? ''}|${ev.time}|${ev.event}|${ev.player?.id ?? ''}|${String(ev.player?.name ?? '')}|${ev.is_home}|${ev.is_away}`;
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

  return `${headline} | ${home} ${score} ${away}, ${dk}' ${oyuncu}\n${tweetFooter(team)}`;
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

function ensureEventSet(matchKey) {
  if (!processedEventIds.has(matchKey)) {
    processedEventIds.set(matchKey, new Set());
  }
  return processedEventIds.get(matchKey);
}

async function checkAllTeams() {
  log('🔄 Kontrol başladı...');

  for (const team of TEAMS) {
    const rowKey = teamRowKey(team);
    const match = await fetchLiveMatch(team.id, team.competitionId);

    if (!match) {
      const oldKey = teamActiveMatchKey.get(rowKey);
      if (oldKey) {
        previousState.delete(oldKey);
        processedEventIds.delete(oldKey);
        teamActiveMatchKey.delete(rowKey);
      }
      log(`⚪ ${team.name}: Canlı maç yok`);
      continue;
    }

    const matchId = match.id;
    const matchKey = String(matchId);
    teamActiveMatchKey.set(rowKey, matchKey);

    const prev = previousState.get(matchKey);
    const seen = ensureEventSet(matchKey);

    const { events, matchDetail } = await fetchMatchEventsBundle(matchId);
    const merged = mergeLiveMatchWithEventsDetail(match, matchDetail);

    const { home: homeName, away: awayName } = getMatchTeamLabels(merged);
    const minute = merged.time || '?';
    const status = merged.status || '';

    /** GOL tweet’i ile aynı yapı: tek satır `BAŞLIK | …`, alt satır hashtag */
    const kickoffHead = isTurkeySuperLig(team) ? 'MAÇIMIZ BAŞLADI' : 'MAÇ BAŞLADI';
    const ftHead = isTurkeySuperLig(team) ? 'MAÇIMIZ BİTTİ' : 'MAÇ BİTTİ';

    // İlk kez bu maçı görüyoruz → başlangıç tweet'i; mevcut olayları tekrar etme
    if (!prev) {
      log(`🆕 ${team.name}: Yeni maç tespit edildi (${homeName} vs ${awayName})`);

      const kickoff = `${kickoffHead} | ${homeName} - ${awayName}\n${tweetFooter(team)}`;

      await sendTweet(kickoff);

      for (const e of events) {
        const k = eventDedupeKey(e);
        if (k) seen.add(k);
      }

      previousState.set(matchKey, { status, minute, score: getMatchScoreLine(merged) });
      continue;
    }

    const newcomers = events
      .filter((e) => {
        const k = eventDedupeKey(e);
        return k && !seen.has(k);
      })
      .sort(
        (a, b) =>
          (Number(a.sort) || 0) - (Number(b.sort) || 0) ||
          (Number(a.time) || 0) - (Number(b.time) || 0)
      );

    for (const ev of newcomers) {
      const text = buildEventTweet(team, merged, ev);
      await sendTweet(text);
      const k = eventDedupeKey(ev);
      if (k) seen.add(k);
    }

    if ((status === 'FT' || status === 'AET') && prev.status !== 'FT' && prev.status !== 'AET') {
      const ft =
        `${ftHead} | ${homeName} ${normalizeScoreDisplay(getMatchScoreLine(merged))} ${awayName}\n` +
        tweetFooter(team);

      await sendTweet(ft);
    }

    previousState.set(matchKey, { status, minute, score: getMatchScoreLine(merged) });
  }

  log('✅ Kontrol tamamlandı\n');
}

async function startBot() {
  log('🤖 Ofsayt Yok Tweet Bot başlatılıyor...');
  log(`🧪 DRY_RUN modu: ${isDryRun() ? 'AÇIK (tweet gönderilmez)' : 'KAPALI (gerçek tweet)'}`);

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
