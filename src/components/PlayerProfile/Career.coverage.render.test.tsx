import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/lib/i18nNamespaces/player';
import osimhenFixture from '@/services/sportmonks/__fixtures__/playerCareerOsimhen.json';
import lamineFixture from '@/services/sportmonks/__fixtures__/playerCareerLamineYamal.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';
import Career from './Career';

const seasonsOf = (f: unknown) => mapPlayerProfile((f as { data: RawPlayer }).data).seasons;
const text = (h: string) => h.replace(/<[^>]+>/g, '').trim();
const teamItems = (html: string) => [...html.matchAll(/<li data-testid="career-team-total">(.*?)<\/li>/g)].map((m) => text(m[1]));
const totalHeader = (html: string) => text(html.match(/<tr[^>]*data-testid="career-total"[^>]*><th[^>]*>(.*?)<\/th>/)![1]);
const NOTE = 'Veri planımız eski yerel lig sezonlarını kapsamıyor; toplamlar kısmi olabilir.';

describe('Kariyer kartı — "Kısmi veri" rozeti ve kapsam notu', () => {
  const osimhen = renderToStaticMarkup(<Career seasons={seasonsOf(osimhenFixture)} />);

  it('Osimhen: rozet Napoli ve Lille toplamında, Galatasaray\'da yok; genel toplamda var', () => {
    expect(teamItems(osimhen)).toEqual(['GalatasarayM 77G 65A 16', 'NapoliKısmi veriM 20G 11A 1', 'LOSC LilleKısmi veriM 5G 2A 0']);
    expect(totalHeader(osimhen)).toBe('Genel toplam Kısmi veri');
  });

  it('kapsam notu tek cümle, başlığın hemen altında (tablodan önce)', () => {
    const note = osimhen.indexOf(NOTE);
    expect(note).toBeGreaterThan(osimhen.indexOf('>Kariyer</h2>'));
    expect(note).toBeLessThan(osimhen.indexOf('<table'));
    expect(osimhen.split(NOTE)).toHaveLength(2);
  });

  it('Lamine Yamal 2024/25 ve sonrası: rozet hiç yok, not yine başlık altında', () => {
    const recent = seasonsOf(lamineFixture).filter((s) => s.seasonName >= '2024/2025');
    const html = renderToStaticMarkup(<Career seasons={recent} />);
    expect(html).not.toContain('Kısmi veri');
    expect(totalHeader(html)).toBe('Genel toplam');
    expect(html.indexOf(NOTE)).toBeLessThan(html.indexOf('<table'));
  });
});
