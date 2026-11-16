/**
 * Maç sayfası SEO / GEO metinleri (sunucuda, ek istek yok): başlık, açıklama, H1 ve "Maç bilgisi" özeti.
 *
 * Amaç: "X - Y maçı ne zaman / saat kaçta / hangi kanalda / kaç kaç bitti" aramaları ve AI cevapları için sayfanın ilk
 * HTML'inde net, alıntılanabilir cümleler. Yalnız maç nesnesinde zaten olan alanlar kullanılır. Kumar dili yok.
 */
import type { Match } from '@/models/liveScore';
import type { MatchEvent } from '@/models/domain';
import { matchKickoffMs, isMatchLive } from '@/utils/matchActivity';

const dateFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
});
const timeFmt = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

type SeoMatch = Pick<
  Match,
  'status' | 'state_code' | 'date' | 'scheduled' | 'time_tbd' | 'home' | 'away' | 'scores' | 'score' | 'competition' | 'competition_name' | 'round' | 'stage' | 'tv_stations' | 'venue_info' | 'location' | 'referee' | 'coaches'
>;

export type MatchSeo = {
  title: string;
  description: string;
  h1: string;
  /** Görünür "Maç bilgisi" paragrafı (1–4 cümle). Takım adı yoksa boş. */
  summary: string[];
};

/** "2 - 1" / "2-1" → "2-1"; geçersizse null. */
export function normalizeScore(raw: string | null | undefined): string | null {
  const m = /^\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*$/.exec(raw ?? '');
  return m ? `${m[1]}-${m[2]}` : null;
}

function kickoff(m: SeoMatch): { date: string; time: string | null } | null {
  const k = matchKickoffMs(m as Match);
  if (k != null) {
    const d = new Date(k);
    return { date: dateFmt.format(d), time: m.time_tbd ? null : timeFmt.format(d) };
  }
  if (m.date && /^\d{4}-\d{2}-\d{2}$/.test(m.date)) {
    return { date: dateFmt.format(new Date(`${m.date}T12:00:00Z`)), time: null };
  }
  return null;
}

/** Ek (-de/-da) uyumu riskine girmeden "Stadyum: X (şehir)" kalıbı için ad. */
function venueText(m: SeoMatch): string | null {
  const name = m.venue_info?.name || m.location;
  if (!name) return null;
  const city = m.venue_info?.city;
  return city && !name.includes(city) ? `${name} (${city})` : name;
}

type SeoEvent = Pick<MatchEvent, 'event' | 'time' | 'is_home' | 'player' | 'rescinded'> & { extra_minute?: number | null };

const SCORER_EVENTS = new Set(['GOAL', 'PENALTY']);

/** "Goller: Icardi 23', Osimhen 67' (pen.) (Galatasaray); Dzeko 80' (Fenerbahçe). Kendi kalesine: X 55'." — olay yoksa null. */
export function goalsSentence(events: SeoEvent[] | null | undefined, home: string, away: string): string | null {
  const list = (events ?? []).filter((e) => !e.rescinded && e.player?.name);
  const fmt = (e: SeoEvent) => `${e.player.name} ${e.time}'${e.event === 'PENALTY' ? ' (pen.)' : ''}`;
  const side = (h: boolean) => list.filter((e) => SCORER_EVENTS.has(e.event) && e.is_home === h).map(fmt);
  const hs = side(true);
  const as = side(false);
  const own = list.filter((e) => e.event === 'OWN_GOAL').map((e) => `${e.player.name} ${e.time}'`);
  const parts: string[] = [];
  if (hs.length) parts.push(`${hs.join(', ')} (${home})`);
  if (as.length) parts.push(`${as.join(', ')} (${away})`);
  if (!parts.length && !own.length) return null;
  return [parts.length ? `Goller: ${parts.join('; ')}.` : '', own.length ? `Kendi kalesine: ${own.join(', ')}.` : ''].filter(Boolean).join(' ');
}

export type MatchSeoOptions = {
  /** Biten maçta gol atanlar cümlesi için (SSR olayları). */
  events?: SeoEvent[] | null;
  /** Hakem adı sayfada ayrıca bağlantıyla yazılıyorsa özete eklenmez. */
  omitReferee?: boolean;
};

export function buildMatchSeo(m: SeoMatch | null | undefined, brand: (t: string) => string, opts: MatchSeoOptions = {}): MatchSeo {
  const home = m?.home?.name?.trim() || '';
  const away = m?.away?.name?.trim() || '';
  if (!m || !home || !away) {
    return {
      title: brand('Maç Detayı'),
      description: 'Maç detayı, canlı skor, istatistikler ve kadro bilgileri.',
      h1: 'Maç Detayı',
      summary: [],
    };
  }
  const comp = (m.competition?.name || m.competition_name || '').trim();
  const pair = `${home} - ${away}`;
  const ko = kickoff(m);
  const when = ko ? `${ko.date}${ko.time ? `, saat ${ko.time} (TSİ)` : ''}` : null;
  const score = normalizeScore(m.scores?.score) ?? normalizeScore(m.score);
  const special = m.state_code;
  const finished = m.status === 'FINISHED' && !special;
  const live = isMatchLive(m as Match);
  const postponed = special === 'POSTPONED' || special === 'TBA' || special === 'DELAYED';
  const cancelled = special === 'CANCELLED' || special === 'ABANDONED' || special === 'DELETED';

  let title: string;
  let description: string;
  const summary: string[] = [];
  const compPart = comp ? `${comp} ` : '';
  const roundPart = m.round && /^\d+$/.test(m.round) ? `${m.round}. hafta ` : '';

  if (finished && score) {
    const [h, a] = score.split('-');
    title = brand(`${home} ${h}-${a} ${away} Maç Sonucu`);
    description = `${home} ${h}-${a} ${away}${comp ? ` (${comp})` : ''} maç sonucu, goller, istatistikler, kadrolar ve maç anlatımı.`;
    summary.push(`${home}, ${compPart}${roundPart}maçında${when ? ` ${when}` : ''} ${away} ile karşılaştı; maç ${score} sona erdi.`);
    const goals = goalsSentence(opts.events, home, away);
    if (goals) summary.push(goals);
  } else if (live) {
    title = brand(`${pair} Canlı Skor${score ? ` (${score})` : ''}`);
    description = `${pair}${comp ? ` (${comp})` : ''} maçını canlı takip et: anlık skor, goller, istatistikler ve kadrolar.`;
    summary.push(`${home} ile ${away} arasındaki ${compPart}${roundPart}maçı şu an oynanıyor${score ? `; skor ${score}` : ''}.`);
  } else if (cancelled) {
    title = brand(`${pair} Maçı`);
    description = `${pair}${comp ? ` (${comp})` : ''} maç bilgileri.`;
    summary.push(`${home} - ${away} ${compPart}maçı oynanmadı (iptal edildi ya da yarıda kaldı).`);
  } else if (postponed) {
    title = brand(`${pair} Maçı Ne Zaman?`);
    description = `${pair}${comp ? ` (${comp})` : ''} maçı ertelendi ya da tarihi henüz kesinleşmedi; yeni tarih, kadrolar ve istatistikler.`;
    summary.push(`${home} - ${away} ${compPart}maçının tarihi henüz kesinleşmedi.`);
  } else {
    const channels = m.tv_stations?.length ? m.tv_stations.slice(0, 3).join(', ') : null;
    // Arama kalıbı "ne zaman, saat kaçta, hangi kanalda": kanal bilgisi varsa başlıkta ve ilk cümlede cevaplanır.
    title = brand(`${pair} Maçı Ne Zaman, Saat Kaçta${channels ? ', Hangi Kanalda' : ''}?`);
    description = `${pair}${comp ? ` (${comp})` : ''} maçı${when ? ` ${when}` : ''}${channels ? ` ${channels} ekranlarında` : ''} oynanacak. Muhtemel kadrolar, son form, karşılıklı maçlar ve AI maç analizi.`;
    summary.push(
      `${home} ile ${away}, ${compPart}${roundPart}maçında ${when ?? 'yakında'} karşı karşıya gelecek${channels ? `; maç ${channels} ekranlarından yayınlanacak` : ''}.`,
    );
  }

  const venue = venueText(m);
  if (venue) summary.push(`Stadyum: ${venue}.`);
  // Yaklaşan maçta kanal ilk cümlede; canlı / ertelenen maçta ayrı cümle.
  if (!finished && !cancelled && m.tv_stations?.length && (live || postponed)) summary.push(`Yayın: ${m.tv_stations.slice(0, 4).join(', ')}.`);
  const extras: string[] = [];
  if (m.referee && !opts.omitReferee) extras.push(`Hakem: ${m.referee}`);
  const ch = m.coaches?.homeFull || m.coaches?.home;
  const ca = m.coaches?.awayFull || m.coaches?.away;
  if (ch && ca) extras.push(`Teknik direktörler: ${ch} (${home}), ${ca} (${away})`);
  if (extras.length) summary.push(`${extras.join('. ')}.`);

  const h1 = finished && score ? `${home} ${score} ${away}` : `${pair}${comp ? ` · ${comp}` : ''}`;
  return { title, description, h1, summary };
}
