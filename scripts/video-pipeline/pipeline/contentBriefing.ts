import { scrapeTransfermarkt } from '../scrapers/transfermarkt';
import { scrapeFbref } from '../scrapers/fbref';
import { scrapeWorldFootball } from '../scrapers/worldfootball';
import { getStaticTeamData } from '../scrapers/staticTeamData';
import { toSlug } from '../config';
import type { DataSourceStatus, TeamBriefing } from '../types';

function buildInterestingFacts(briefing: Omit<TeamBriefing, 'interestingFacts'>): string[] {
  const facts: string[] = [];

  if (briefing.titles > 0) {
    facts.push(`${briefing.titles} kez Dünya Kupası şampiyonu oldu.`);
  }

  if (briefing.totalAppearances > 0) {
    facts.push(`${briefing.totalAppearances}. Dünya Kupası katılımı.`);
  }

  if (briefing.lastWcFinish && briefing.lastWcFinish !== 'Bilinmiyor') {
    const lastYear = briefing.wcHistory.filter((h) => h.finish === briefing.lastWcFinish).slice(-1)[0]?.year;
    const yearLabel = lastYear ? ` (${lastYear})` : '';
    facts.push(`Son Dünya Kupası'nda ${briefing.lastWcFinish} oldu${yearLabel}.`);
  }

  if (briefing.bestFinish && briefing.bestFinish !== 'Bilinmiyor' && briefing.bestFinish !== briefing.lastWcFinish) {
    facts.push(`Tarihsel en iyi derece: ${briefing.bestFinish}.`);
  }

  if (briefing.avgAge > 0) {
    if (briefing.avgAge > 28) {
      facts.push(`Kadronun ortalama yaşı ${briefing.avgAge.toFixed(1)} — deneyimli ama yaşlı bir kadro.`);
    } else if (briefing.avgAge < 24) {
      facts.push(`Kadronun ortalama yaşı ${briefing.avgAge.toFixed(1)} — gençlik dolu bir kadroya sahip.`);
    } else {
      facts.push(`Kadronun ortalama yaşı ${briefing.avgAge.toFixed(1)}.`);
    }
  }

  if (briefing.squadValue && briefing.squadValue !== 'Bilinmiyor') {
    facts.push(`Toplam kadro değeri: ${briefing.squadValue}.`);
  }

  if (briefing.goalsPerGame !== null) {
    facts.push(`Bu sezon maç başı ${briefing.goalsPerGame.toFixed(2)} gol attı.`);
  }

  if (briefing.xgPerGame !== null) {
    facts.push(`Maç başı beklenen gol (xG): ${briefing.xgPerGame.toFixed(2)}.`);
  }

  if (briefing.possessionPct !== null) {
    facts.push(`Ortalama topa sahip olma oranı: %${briefing.possessionPct.toFixed(0)}.`);
  }

  if (briefing.starPlayer) {
    const sp = briefing.starPlayer;
    facts.push(`Yıldız oyuncu: ${sp.name} (${sp.age} yaşında, değer: ${sp.value}).`);
  }

  return facts;
}

export async function buildTeamBriefing(team: string): Promise<TeamBriefing> {
  console.log(`\n[Pipeline] "${team}" için veri toplanıyor...`);

  const [tm, fb, wf] = await Promise.allSettled([
    scrapeTransfermarkt(team),
    scrapeFbref(team),
    scrapeWorldFootball(team),
  ]);

  const tmData = tm.status === 'fulfilled' ? tm.value : null;
  const fbData = fb.status === 'fulfilled' ? fb.value : null;
  const wfData = wf.status === 'fulfilled' ? wf.value : null;

  // Statik fallback: Transfermarkt bot koruması veya yanlış veri döndürdüğünde kullanılır
  const staticData = getStaticTeamData(team);

  // Transfermarkt verisinin güvenilir olup olmadığını kontrol et
  // "MARKET VALUES" veya "Bilinmiyor" gibi hatalı değerleri filtrele
  const tmSquadValue = tmData?.squadValue;
  const isTmSquadValueValid = tmSquadValue &&
    tmSquadValue !== 'Bilinmiyor' &&
    !tmSquadValue.toUpperCase().includes('MARKET') &&
    tmSquadValue.includes('€') &&
    // Tek oyuncu değeri değil toplam: en az 3 haneli milyon (€100M+)
    (() => {
      const numStr = tmSquadValue.replace(/[^0-9.,]/g, '').replace(',', '.');
      const num = parseFloat(numStr);
      return !isNaN(num) && num > 100;
    })();

  const squadValue = isTmSquadValueValid
    ? tmSquadValue!
    : (staticData?.squadValue ?? 'Bilinmiyor');

  const avgAge = (tmData?.avgAge && tmData.avgAge > 0)
    ? tmData.avgAge
    : (staticData?.avgAge ?? 0);

  const starPlayer = tmData?.starPlayer?.name && tmData.starPlayer.age > 0
    ? tmData.starPlayer
    : (staticData?.starPlayer ?? null);

  // Son Dünya Kupası derece (2022 veya önceki)
  const lastWcEntry = wfData?.history.filter((h) => h.year <= 2022).sort((a, b) => b.year - a.year)[0];
  const lastWcFinish = lastWcEntry?.finish ?? 'Bilinmiyor';

  // Granular kaynak durumu: bayrak artık "true" yerine verinin gerçekte
  // nereden geldiğini söylüyor (live = canlı scrape, static = fallback, failed = yok).
  const transfermarktStatus: DataSourceStatus = isTmSquadValueValid
    ? 'live'
    : (staticData ? 'static' : 'failed');

  const hasFbrefStat =
    fbData != null &&
    (fbData.goalsPerGame !== null || fbData.xgPerGame !== null || fbData.possessionPct !== null);
  const fbrefStatus: DataSourceStatus = hasFbrefStat ? 'live' : 'failed';

  // worldfootball artık canlı scrape değil; doğrulanmış statik WC geçmişi tablosu.
  const worldfootballStatus: DataSourceStatus = wfData ? 'static' : 'failed';

  const partial: Omit<TeamBriefing, 'interestingFacts'> = {
    team,
    teamSlug: toSlug(team),
    squadValue,
    avgAge,
    starPlayer,
    wcHistory: wfData?.history ?? [],
    titles: wfData?.titles ?? 0,
    bestFinish: wfData?.bestFinish ?? 'Bilinmiyor',
    totalAppearances: wfData?.totalAppearances ?? 0,
    lastWcFinish,
    goalsPerGame: fbData?.goalsPerGame ?? null,
    xgPerGame: fbData?.xgPerGame ?? null,
    possessionPct: fbData?.possessionPct ?? null,
    sources: {
      transfermarkt: transfermarktStatus,
      fbref: fbrefStatus,
      worldfootball: worldfootballStatus,
    },
  };

  const interestingFacts = buildInterestingFacts(partial);

  return { ...partial, interestingFacts };
}
