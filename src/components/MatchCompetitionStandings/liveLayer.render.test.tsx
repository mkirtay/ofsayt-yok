import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CompetitionTableData, CompetitionTableStandingRow } from '@/services/liveScoreService';
import type { Match } from '@/models/liveScore';
import type { LiveStandingsState } from '@/hooks/useLiveStandings';
import MatchCompetitionStandings from './index';

const row = (rank: number, id: number, points: number): CompetitionTableStandingRow => ({
  rank,
  points,
  matches: 8,
  goal_diff: 0,
  goals_scored: 10,
  goals_conceded: 10,
  won: 5,
  drawn: 1,
  lost: 2,
  team: { id, name: `Takım ${id}`, short_code: `T${id}` },
});
const data: CompetitionTableData = {
  competition: { id: 600, name: 'Süper Lig' },
  season: { id: 28203 },
  table: [row(1, 31, 19), row(2, 81, 17), row(3, 2, 16), row(4, 7, 10)],
};
const NOW = Date.UTC(2026, 9, 26, 18, 0);
// "Canlı" / "son güncelleme" ayrımı saate bağlı: testler NOW anında koşar.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
const live = (rows: [number, number, number][], extra: Partial<LiveStandingsState> = {}): LiveStandingsState => ({
  data: { leagueId: 600, rows: rows.map(([participant_id, position, points]) => ({ participant_id, position, points, result: 'equal', season_id: 28203 })) },
  updatedAt: NOW,
  failing: false,
  ...extra,
});
const match = (id: number, home: number, away: number, score: string, status = 'IN PLAY', time = "71'"): Match =>
  ({
    id,
    status,
    time,
    home: { id: home, name: `Takım ${home}`, logo: `https://cdn.example/${home}.png` },
    away: { id: away, name: `Takım ${away}`, logo: `https://cdn.example/${away}.png` },
    scores: { score },
    competition: { id: 600, name: 'Süper Lig' },
  }) as Match;

// 2 – 31: 1–0 → 2 (16 + 3 = 19) birinci, 31 ikinci, 81 üçüncü. (Id'ler gerçek kısaltma eşlemesiyle çakışmasın: config/teamShortNames)
const LIVE = live([[31, 2, 19], [81, 3, 17], [2, 1, 19], [7, 4, 10]]);
const MATCHES = [match(9, 2, 31, '1-0')];

const render = (props: Partial<Parameters<typeof MatchCompetitionStandings>[0]> = {}) =>
  renderToStaticMarkup(<MatchCompetitionStandings data={data} hideHeader {...props} />);
const teamOrder = (html: string) => [...html.matchAll(/href="\/teams\/(\d+)"/g)].map((m) => Number(m[1]));
const tbody = (html: string) => html.slice(html.indexOf('<tbody'), html.indexOf('</tbody>'));
const rowOf = (html: string, id: number) => {
  const body = tbody(html);
  const start = body.indexOf(`data-team="${id}"`);
  return body.slice(start, body.indexOf('</tr>', start));
};

describe('<MatchCompetitionStandings live /> canlı puan durumu', () => {
  it('başlık "Canlı puan durumu" + açıklama; skor şeridi gerçek takım, skor, dakika ve maç bağlantısıyla', () => {
    const html = render({ live: LIVE, liveMatches: MATCHES });
    expect(html).toContain('Canlı puan durumu');
    expect(html).toContain('Devam eden maçların mevcut skorlarına göre.');
    expect(html).toMatch(/aria-label="Tabloyu etkileyen canlı maçlar"/);
    const link = html.slice(html.lastIndexOf('<a', html.indexOf('href="/matches/9-takim-2-takim-31"')), html.indexOf('</a>', html.indexOf('/matches/9-')));
    expect(link).toContain('aria-label="Takım 2 1–0 Takım 31, 71&#x27;"');
    expect(link).toMatch(/stripTeam[^>]*><img[^>]*>T2<\/span><b[^>]*>1–0<\/b><span[^>]*>T31<img/);
    expect(link).toMatch(/stripClock[^>]*>71&#x27;</);
  });

  it('canlı sıraya göre dizilir; sıra değişimi ayrı sütunda "↑ 2" / "↓ 1" + açıklama; hareketsizde ok ve sıfır yok', () => {
    const html = render({ live: LIVE, liveMatches: MATCHES });
    expect(teamOrder(html)).toEqual([2, 31, 81, 7]);
    expect(rowOf(html, 2)).toMatch(/data-move="up"[^>]*title="Maç öncesine göre 2 basamak yükseldi"/);
    expect(rowOf(html, 2)).toContain('↑ 2');
    expect(rowOf(html, 31)).toContain('Maç öncesine göre 1 basamak geriledi');
    expect(rowOf(html, 7)).not.toContain('data-move');
    expect(rowOf(html, 7)).not.toMatch(/[↑↓]/);
    expect(html).toContain('Sıra değişimi'); // sütun başlığı (ekran okuyucu)
  });

  it('puan nötr ve kalın; canlı katkı ayrı "+3" ile; canlı oynayan takımın altında skor/rakip/dakika', () => {
    const html = render({ live: LIVE, liveMatches: MATCHES });
    const r2 = rowOf(html, 2);
    // Maç öncesi puan yazılır; canlı katkı yanında "+3", sonuç ipucu başlıkta.
    expect(r2).toMatch(/pointsValue[^>]*>16</);
    expect(r2).toMatch(/pointsDelta[^>]*title="Maç böyle biterse 19 puan"><span aria-hidden="true">\+3</);
    expect(r2).toContain('Canlı sonuçla +3 puan');
    expect(r2).toMatch(/liveScore[^>]*>1–0<\/b> T31<span class="[^"]*liveClock[^"]*"> · 71&#x27;/);
    expect(r2).toContain('Canlı maç: Takım 31 karşısında 1–0, 71&#x27;');
    // Doğrulanmış skorla O ve Av güncel.
    expect(r2).toMatch(/data-flash="2:matches" data-flash-value="9"/);
    expect(r2).toMatch(/data-flash="2:goalDiff" data-flash-value="1"/);
    // Kaybeden: puan farkı yok → "+" yok, alt satır takımın gözünden 0–1.
    const r34 = rowOf(html, 31);
    expect(r34).not.toContain('+0');
    expect(r34).toMatch(/liveScore[^>]*>0–1</);
    expect(html).not.toMatch(/livePoints|liveBadge/);
  });

  it('devre arası: dakika yerine "İY"', () => {
    const html = render({ live: LIVE, liveMatches: [match(9, 2, 31, '1-0', 'HALF TIME BREAK', "45'")] });
    expect(rowOf(html, 2)).toContain(' · İY');
  });

  it('güncelleme kesildi: son veri korunur ama canlı gibi sunulmaz ("Puan durumu" + son güncelleme saati)', () => {
    const html = render({ live: { ...LIVE, failing: true }, liveMatches: MATCHES });
    expect(html).not.toContain('Canlı puan durumu');
    expect(html).toMatch(/liveHeading[^>]*>Puan durumu</);
    expect(html).toContain('Son canlı güncelleme 21:00. Bağlantı kesildi; sıra ve puanlar o anki skorlara göre.');
    expect(html).not.toContain('livePulse');
    expect(teamOrder(html)).toEqual([2, 31, 81, 7]);
  });

  it('son maç bitti, resmî tablo henüz saymadı: sağlayıcının tablosu "Puan durumu (resmî tablo güncelleniyor)" ile', () => {
    // Bağlantı kesik olsa da (failing) skorlar kesin: "son canlı güncelleme" notu yok.
    const html = render({ live: { ...LIVE, failing: true }, liveMatches: [match(9, 2, 31, '1-0', 'FINISHED', 'FT')] });
    expect(teamOrder(html)).toEqual([2, 31, 81, 7]);
    expect(html).toMatch(/data-live="settling"/);
    expect(html).toMatch(/liveHeading[^>]*>Puan durumu <span[^>]*>\(resmî tablo güncelleniyor\)<\/span>/);
    expect(html).not.toContain('Canlı puan durumu');
    expect(html).not.toContain('Son canlı güncelleme');
    expect(html).not.toContain('livePulse');
    expect(html).not.toContain('Tabloyu etkileyen canlı maçlar'); // şerit yok
    expect(rowOf(html, 2)).not.toContain('liveLine');
    expect(rowOf(html, 2)).toMatch(/data-flash="2:matches" data-flash-value="9"/);
    expect(rowOf(html, 2)).toMatch(/↑\s2/);
    // Resmî tablo maçı saydı (temel = sağlayıcı) → normal tablo.
    const official = { ...data, table: [row(1, 2, 19), row(2, 31, 19), row(3, 81, 17), row(4, 7, 10)].map((r) => (r.team!.id === 2 || r.team!.id === 31 ? { ...r, matches: 9 } : r)) };
    const after = renderToStaticMarkup(
      <MatchCompetitionStandings data={official} hideHeader live={LIVE} liveMatches={[match(9, 2, 31, '1-0', 'FINISHED', 'FT')]} />,
    );
    expect(after).not.toContain('data-live');
    expect(after).not.toContain('resmî tablo güncelleniyor');
  });

  it('katman yok / sezon farklı / tabloyu etkileyen canlı maç yok → normal tablo, canlı başlık ve değişim sütunu yok', () => {
    const otherSeason = live([[31, 2, 19], [81, 3, 17], [2, 1, 19], [7, 4, 10]]);
    otherSeason.data.rows.forEach((r) => (r.season_id = 25749));
    for (const props of [
      { live: null },
      { live: otherSeason, liveMatches: MATCHES },
      { live: LIVE, liveMatches: [match(10, 501, 502, '0-0')] },
    ]) {
      const html = render(props);
      expect(teamOrder(html)).toEqual([31, 81, 2, 7]);
      expect(html).not.toContain('Canlı puan durumu');
      expect(html).not.toContain('colMove');
      expect(html).not.toContain('pointsDelta');
    }
  });

  it('canlı maç listesi verilmezse (eski çağıran) yalnız sıra + puan bindirilir', () => {
    const html = render({ live: LIVE });
    expect(teamOrder(html)).toEqual([2, 31, 81, 7]);
    expect(html).toContain('Canlı puan durumu');
    expect(html).not.toContain('liveLine');
  });
});

describe('<MatchCompetitionStandings /> sunum', () => {
  it('Özet/Detaylar: ek sütunlar (G/B/M/A/Y, form) colOpt ile işaretli, düğme aria-pressed; veri kaybolmaz', () => {
    const html = render({ live: LIVE, liveMatches: MATCHES });
    expect(html).toMatch(/<button type="button" class="[^"]*detailsToggle[^"]*" aria-pressed="false"[^>]*>Detaylar<\/button>/);
    const opt = [...html.matchAll(/<th class="[^"]*colOpt[^"]*"[^>]*title="([^"]+)"/g)].map((m) => m[1]);
    expect(opt).toEqual(['Galibiyet', 'Beraberlik', 'Mağlubiyet', 'Atılan gol', 'Yenilen gol']);
    // Her satırda bütün istatistik hücreleri var (gizleme yalnız CSS).
    expect(rowOf(html, 7).match(/<td/g)).toHaveLength(1 + 1 + 1 + 7 + 1);
  });

  it('bölge: büyük renkli kutu yerine data-zone şeridi + yalnız görünen bölgelerin lejantı', () => {
    // Legacy id 6 = Süper Lig kuralları (testte Sportmonks bayrağı kapalı).
    const big = { ...data, competition: { id: 6, name: 'Süper Lig' }, table: Array.from({ length: 18 }, (_, i) => row(i + 1, 9100 + i, 40 - i)) };
    const html = renderToStaticMarkup(<MatchCompetitionStandings data={big} hideHeader />);
    expect(html).toMatch(/class="[^"]*colRank[^"]*" data-zone="ucl">1</);
    expect(html).toMatch(/data-zone="relegation">18</);
    expect(html).not.toMatch(/rank(Ucl|Relegation)/);
    const legend = html.slice(html.indexOf('aria-label="Sıra renkleri"'));
    expect([...legend.matchAll(/data-zone="(\w+)"/g)].map((m) => m[1])).toEqual(['ucl', 'ucl_qual', 'europa', 'conference_qual', 'relegation']);
  });

  it('favori takım yıldızla, maç takımları vurgulu satırla ayrılır', () => {
    const html = render({ favoriteTeamIds: [81], homeTeamId: 2 });
    expect(rowOf(html, 81)).toContain('aria-label="Favori takım"');
    expect(html).toMatch(/data-team="2" class="[^"]*rowHighlight/);
    expect(rowOf(html, 31)).not.toContain('Favori takım');
  });

  it('başlıkta lig logosu ve adı (verilirse)', () => {
    const html = renderToStaticMarkup(<MatchCompetitionStandings data={data} competitionLogo="https://cdn.example/600.png" />);
    expect(html).toMatch(/<h2 class="[^"]*title[^"]*"><img[^>]*titleLogo[^>]*>Süper Lig<\/h2>/);
  });
});
