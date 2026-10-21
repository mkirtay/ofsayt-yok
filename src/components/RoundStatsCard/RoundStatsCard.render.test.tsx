import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoundStatsCard from './Card';
import RoundStatsSlot from './index';
import { stageKey, stageLabel, unitDateRange, unitLabel } from './labels';
import { buildStatUnits, summarizeRoundStatistics, type RawRoundStatistic, type RawSeasonStage } from '@/services/sportmonks/roundStats';
import { findGamblingTerms } from '@/utils/gamblingTerms';
import roundSl8 from '@/services/sportmonks/__fixtures__/roundStatisticsSuperLig8.json';
import stagesSl from '@/services/sportmonks/__fixtures__/stagesSeasonSuperLig.json';
import stagesUcl from '@/services/sportmonks/__fixtures__/stagesSeasonUcl.json';
import stageUclPo from '@/services/sportmonks/__fixtures__/stageStatisticsUclPlayoffs.json';
import tr from '../../../public/locales/tr/roundStats.json';
import en from '../../../public/locales/en/roundStats.json';

const summarySl = summarizeRoundStatistics(roundSl8.data as RawRoundStatistic[]);
const unitsSl = buildStatUnits(stagesSl.data as RawSeasonStage[], 'rounds', '2026-10-21');

function render(league: number, season: number, data: unknown) {
  const client = new QueryClient();
  client.setQueryData(['round-stats', league, season, 'default'], data);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <RoundStatsCard leagueId={league} seasonId={season} />
    </QueryClientProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('<RoundStatsCard />', () => {
  it('Süper Lig 8. hafta: başlık, seçici, 4 metrik, haftanın oyuncusu / takımı, dakika dağılımı', () => {
    const html = render(600, 28203, { mode: 'rounds', units: unitsSl, selected: 'r410383', summary: summarySl });
    const t = text(html);
    expect(t).toContain('Haftanın Özeti');
    expect(t).toContain('8. Hafta');
    expect(t).toContain('16–19 Eki');
    expect(t).toContain('9 maç');
    expect(t).toContain('23');
    expect(t).toContain('Maç başı 2,56');
    expect(t).toContain('%44');
    expect(t).toContain('4/9 maç');
    expect(t).toContain('%56');
    expect(t).toContain('33 sarı · 0 kırmızı');
    expect(t).toContain('Haftanın oyuncusu');
    expect(t).toContain('Adem Arous');
    expect(html).toContain('href="/players/37667492"');
    expect(t).toContain('Haftanın takımı');
    expect(html).toContain('href="/teams/1071"');
    expect(html).toContain('aria-label="Önceki hafta"');
    // son birim → sonraki düğmesi kapalı
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Sonraki hafta"/);
    expect(t).toContain('Gollerin dakikalara dağılımı');
    expect(html).toContain('aria-label="75-90. dk: 8 gol"');
    expect(findGamblingTerms(t)).toEqual([]);
  });

  it('Şampiyonlar Ligi: aşama özeti, Türkçe aşama adı', () => {
    const units = buildStatUnits(stagesUcl.data as RawSeasonStage[], 'stages', '2026-10-21');
    const html = render(2, 28155, {
      mode: 'stages',
      units,
      selected: 's77483291',
      summary: summarizeRoundStatistics(stageUclPo.data as RawRoundStatistic[]),
    });
    const t = text(html);
    expect(t).toContain('Aşama Özeti');
    expect(t).toContain('Play-off');
    expect(t).toContain('En yüksek puanlı oyuncu');
    expect(html).toContain('aria-label="Önceki aşama"');
  });

  it('veri yok → kart hiç çizilmez; birim yok → çizilmez', () => {
    expect(render(600, 28203, { mode: 'rounds', units: unitsSl, selected: 'r410383', summary: null })).toBe('');
    expect(render(600, 28203, { mode: 'rounds', units: [], selected: null, summary: null })).toBe('');
  });

  it('sezon bilinmiyorken yer tutucu (aria-busy) çizer', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <RoundStatsCard leagueId={600} seasonId={null} />
      </QueryClientProvider>,
    );
    expect(html).toContain('aria-busy="true"');
  });

  it('yuva SSR\'da boş ama yer ayrılmış kutu (kart kodu ilk yüke girmez)', () => {
    const html = renderToStaticMarkup(<RoundStatsSlot leagueId={600} seasonId={28203} />);
    expect(html).toContain('data-testid="round-stats-slot"');
    expect(html).not.toContain('Haftanın Özeti');
  });
});

describe('etiketler', () => {
  const t = (key: string, opts?: Record<string, unknown>) => {
    const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], tr);
    return typeof v === 'string' ? v.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? '')) : key;
  };

  it('Sportmonks aşama adları → anahtar → çeviri; bilinmeyen ad aynen', () => {
    expect(stageKey('1st Qualifying Round')).toBe('1stQualifyingRound');
    expect(stageKey('Knockout Round Play-offs')).toBe('knockoutRoundPlayOffs');
    expect(stageKey('Quarter-finals')).toBe('quarterFinals');
    expect(stageKey('8th Finals')).toBe('8thFinals');
    expect(stageLabel('League Stage', t)).toBe('Lig Aşaması');
    expect(stageLabel('Apertura', t)).toBe('Apertura');
  });

  it('birim başlığı', () => {
    expect(unitLabel({ kind: 'round', name: '8', stageName: null }, t)).toBe('8. Hafta');
    expect(unitLabel({ kind: 'round', name: '1', stageName: 'Championship Round' }, t)).toBe('Şampiyonluk Grubu · 1. Hafta');
    expect(unitLabel({ kind: 'stage', name: 'Play-offs', stageName: null }, t)).toBe('Play-off');
  });

  it('tarih aralığı', () => {
    expect(unitDateRange('2026-10-16', '2026-10-19', 'tr')).toBe('16–19 Eki');
    expect(unitDateRange('2026-10-30', '2026-11-02', 'tr')).toBe('30 Eki – 2 Kas');
    expect(unitDateRange('2026-10-30', '2026-11-02', 'en')).toBe('30 Oct – 2 Nov');
    expect(unitDateRange('2027-01-17', '2027-01-17', 'tr')).toBe('17 Oca');
    expect(unitDateRange(null, null, 'tr')).toBeNull();
  });
});

describe('roundStats sözlüğü', () => {
  const flat = (o: Record<string, unknown>, p = ''): string[] =>
    Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
  const values = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (v && typeof v === 'object' ? values(v as Record<string, unknown>) : [String(v)]));

  it('tr ve en aynı anahtarlar', () => {
    expect(flat(en).sort()).toEqual(flat(tr).sort());
  });

  it('bahis / kumar çağrışımı yok (iki dil)', () => {
    for (const v of [...values(tr), ...values(en)]) expect(findGamblingTerms(v), v).toEqual([]);
  });
});
