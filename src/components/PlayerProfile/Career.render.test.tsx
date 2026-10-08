import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '@/lib/i18nNamespaces/player';
import ugurcanFixture from '@/services/sportmonks/__fixtures__/playerCareerUgurcan.json';
import lamineFixture from '@/services/sportmonks/__fixtures__/playerCareerLamineYamal.json';
import { mapPlayerProfile, type RawPlayer } from '@/services/playerProfile';
import Career from './Career';

const seasonsOf = (f: unknown) => mapPlayerProfile((f as { data: RawPlayer }).data).seasons;
// Test ortamı `node` (DOM yok) — statik HTML'i küçük regex yardımcılarıyla okuruz.
const text = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").trim();
/** `attr` içeren `<tr>`'lerin hücre metinleri (th/td sırasıyla). */
const rowsWith = (html: string, attr: string) =>
  [...html.matchAll(/<tr([^>]*)>(.*?)<\/tr>/g)]
    .filter((m) => m[1].includes(attr))
    .map((m) => [...m[2].matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map((c) => text(c[1])));
const tbody = (html: string, group: string) => html.match(new RegExp(`<tbody data-group="${group}">(.*?)</tbody>`))?.[1] ?? '';

describe('Career (Kariyer kartı)', () => {
  const html = renderToStaticMarkup(<Career seasons={seasonsOf(ugurcanFixture)} />);

  it('erişilebilir tablo: caption, scope="col" başlıklar, kısaltmalar abbr title, satır başlığı takım', () => {
    expect(html).toMatch(/<caption[^>]*>Kariyer: sezon, takım, turnuva, maç, gol ve asist<\/caption>/);
    const thead = html.match(/<thead>(.*?)<\/thead>/)![1];
    expect(thead.match(/<th scope="col"/g)).toHaveLength(6);
    expect([...thead.matchAll(/<abbr title="([^"]+)">/g)].map((m) => m[1])).toEqual(['Maç', 'Gol', 'Asist']);
    expect(html).toMatch(/<tr data-testid="career-row"><td[^>]*>2026\/27<\/td><th scope="row"/);
    // kaydırılabilir bölge klavyeyle odaklanabilir ve adlandırılmış
    expect(html).toMatch(/role="region" aria-label="Kariyer: sezon, takım, turnuva, maç, gol ve asist" tabindex="0"/);
  });

  it('gruplar: önce Lig, sonra Kupa ve uluslararası; ara toplamlar ve genel toplam doğru', () => {
    expect([...html.matchAll(/<tbody data-group="(\w+)"/g)].map((m) => m[1])).toEqual(['league', 'cup']);
    expect(rowsWith(html, 'career-subtotal-league')).toEqual([['Lig toplamı', '', '66', '0', '0']]);
    expect(rowsWith(html, 'career-subtotal-cup')).toEqual([['Kupa ve uluslararası toplamı', '', '44', '0', '0']]);
    expect(rowsWith(html, 'career-total')).toEqual([['Genel toplam', '', '110', '0', '0']]);
  });

  it('satır: kısa sezon, takım linki, turnuva; maç verisi yoksa "—" ve dipnot', () => {
    const rows = rowsWith(html, 'career-row');
    // takım hücresi = ad + dar ekranda görünen turnuva satırı (geniş ekranda gizli; ayrı sütun da var)
    expect(rows[0]).toEqual(['2026/27', 'GalatasaraySuper Lig', 'Super Lig', '5', '0', '0']);
    expect(rows.find((r) => r[0] === '2015/16')).toEqual(['2015/16', 'TrabzonsporEuropa League', 'Europa League', '—', '0', '0']);
    expect(html).toContain('href="/teams/34"');
    expect(html).toContain('maç sayısı verisi yok');
    expect(html).toContain('veri planımızın kapsadığı');
  });

  it('takım bazında: 2+ takımda gösterilir, en son takım önce', () => {
    const teams = [...html.matchAll(/<li data-testid="career-team-total">(.*?)<\/li>/g)].map((m) => text(m[1]));
    expect(teams).toEqual(['GalatasarayM 43G 0A 0', 'TrabzonsporM 67G 0A 0']);
  });

  it('tek kulüp (Lamine Yamal): takım bazında listesi yok, dipnot yok, Copa Del Rey kupa grubunda', () => {
    const one = renderToStaticMarkup(<Career seasons={seasonsOf(lamineFixture)} />);
    expect(one).not.toContain('career-team-total');
    expect(one).not.toContain('maç sayısı verisi yok');
    expect(tbody(one, 'cup')).toContain('Copa Del Rey');
    expect(tbody(one, 'league')).not.toContain('Copa Del Rey');
    expect(rowsWith(one, 'career-total')).toEqual([['Genel toplam', '', '114', '48', '47']]);
  });

  it('veri yoksa kart hiç render edilmez', () => {
    expect(renderToStaticMarkup(<Career seasons={[]} />)).toBe('');
  });
});
