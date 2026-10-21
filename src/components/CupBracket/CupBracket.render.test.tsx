import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CupBracket from './index';
import { connectorsFor, defaultSelection, roundLabel, tieMeta, treeRounds } from './view';
import { buildCupBracket, type RawStage } from '@/services/cupBracket/buildCupBracket';
import { CUP_BRACKET_TEMPLATES } from '@/config/cupBrackets';
import trDict from '../../../public/locales/tr/cupBracket.json';
import uclSeason2526 from '@/services/cupBracket/__fixtures__/uclSeason2526.json';
import uclSeason2627 from '@/services/cupBracket/__fixtures__/uclSeason2627.json';
import turkishCupSeason2627 from '@/services/cupBracket/__fixtures__/turkishCupSeason2627.json';

const build = (leagueId: number, seasonId: number, j: { data: unknown }) =>
  buildCupBracket({ leagueId, seasonId, stages: structuredClone(j.data) as RawStage[], template: CUP_BRACKET_TEMPLATES[leagueId]! })!;
const t = (key: string, opts?: Record<string, unknown>) => {
  const v = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], trDict);
  return String(v ?? key).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(opts?.[k] ?? ''));
};

describe('eleme ağacı görünüm yardımcıları', () => {
  it('tur adları: yuva, ön eleme numarası, erken tur numarası', () => {
    expect(roundLabel({ slot: 'r16', kind: 'bracket', name: '8th Finals' }, t)).toBe('Son 16');
    expect(roundLabel({ slot: null, kind: 'qualifying', name: '2nd Qualifying Round' }, t)).toBe('2. Ön Eleme');
    expect(roundLabel({ slot: null, kind: 'qualifying', name: 'Play-offs' }, t)).toBe('Ön Eleme Play-off');
    expect(roundLabel({ slot: null, kind: 'early', name: 'Round 4' }, t)).toBe('4. Tur');
  });

  it('bağlantı çizgileri: play-off → son 16 düz, sonra çift kollar, final çizgisiz', () => {
    const c = connectorsFor(treeRounds(build(2, 25580, uclSeason2526)));
    expect(c[0]!.every((x) => x === 'straight')).toBe(true);
    expect(c[1]).toEqual(['pairTop', 'pairBottom', 'pairTop', 'pairBottom', 'pairTop', 'pairBottom', 'pairTop', 'pairBottom']);
    expect(c[4]).toEqual([null]);
  });

  it('varsayılan seçim: bitmiş sezonda ağaç / Final; erken tur sürüyorsa o tur; kura bekleyen ŞL’de ağaç / Play-off', () => {
    expect(defaultSelection(build(2, 25580, uclSeason2526))).toEqual({ desktop: 'tree', mobile: 'final' });
    expect(defaultSelection(build(606, 28283, turkishCupSeason2627))).toEqual({ desktop: 'stage-77484784', mobile: 'stage-77484784' });
    expect(defaultSelection(build(2, 28155, uclSeason2627))).toEqual({ desktop: 'tree', mobile: 'ko_po' });
  });

  it('kutu alt satırı: penaltı skoru, başlamamış maçın tarihi (TSİ)', () => {
    const final = build(2, 25580, uclSeason2526).rounds.at(-1)!.ties[0]!;
    expect(tieMeta(final, t, 'tr').text).toBe('Penaltılarla 4–3');
    const tk = build(606, 28283, turkishCupSeason2627).rounds[1]!.ties[0]!;
    expect(tieMeta(tk, t, 'tr', Date.parse('2026-10-21T12:00:00Z')).text).toMatch(/Eki/);
  });
});

describe('<CupBracket />', () => {
  it('tamamlanmış ağaç: 23 kutu, maç sayfası bağlantıları, kazanan vurgusu, lig aşaması bağlantısı', () => {
    const html = renderToStaticMarkup(<CupBracket bracket={build(2, 25580, uclSeason2526)} onShowStandings={() => {}} />);
    expect(html).toContain('href="/matches/19683241-paris-saint-germain-arsenal"');
    expect(html).toContain('Lig aşaması puan durumu');
    expect(html).toContain('Çeyrek Final');
    // Masaüstü ağaç (23 kutu) + mobil Final listesi (tek maç: kutunun tamamı bağlantı)
    expect((html.match(/aria-label="[^"]+ maç sayfası"/g) ?? []).length).toBe(24);
    expect(html).toMatch(/Toplam|PSG|Paris Saint Germain turu geçti/);
  });

  it('kura bekleniyor: boş kutular + mobilde açıklama', () => {
    const html = renderToStaticMarkup(<CupBracket bracket={build(2, 28155, uclSeason2627)} />);
    expect((html.match(/aria-label="Kura bekleniyor"/g) ?? []).length).toBe(23);
    expect(html).toContain('Bu turun kurası henüz çekilmedi.');
    expect(html).toContain('>Ön Eleme Play-off</button>');
  });

  it('kura bekleniyor: lig aşaması bağlantısı yalnız üstte, bir kez', () => {
    const html = renderToStaticMarkup(<CupBracket bracket={build(2, 28155, uclSeason2627)} onShowStandings={() => {}} />);
    expect((html.match(/Lig aşaması puan durumu/g) ?? []).length).toBe(1);
  });
});
