import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MatchVenueCard from './index';

const FULL = {
  name: 'Rams Park',
  city: 'İstanbul',
  capacity: 53978,
  surface: 'grass' as const,
  address: 'İstanbul Çevre Yolu, Aslantepe',
  lat: 41.102778,
  lng: 28.990556,
  image: 'https://cdn.sportmonks.com/images/soccer/venues/3/9667.png',
};

describe('<MatchVenueCard />', () => {
  it('tam veri: başlık, ad, şehir, binlik ayraçlı kapasite, Türkçe zemin, adres, harita bağlantısı, tembel fotoğraf', () => {
    const html = renderToStaticMarkup(<MatchVenueCard venue={FULL} />);
    expect(html).toContain('>Stadyum<');
    expect(html).toContain('>Rams Park<');
    expect(html).toContain('>İstanbul<');
    expect(html).toContain('>53.978<');
    expect(html).toContain('>Doğal çim<');
    expect(html).toContain('İstanbul Çevre Yolu, Aslantepe');
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=41.102778,28.990556"');
    expect(html).toMatch(/target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain('aria-label="Rams Park konumunu Google Haritalar&#x27;da aç (yeni sekmede)"');
    expect(html).toContain('src="/api/img/logo?src=soccer/venues/3/9667.png&amp;w=640"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('alt="Rams Park fotoğrafı"');
    expect(html).toMatch(/width="640" height="360"/);
  });

  it('eksik alanların satırı yok: fotoğraf / adres / zemin / konum yoksa çizilmez', () => {
    const html = renderToStaticMarkup(<MatchVenueCard venue={{ name: 'Amasya 12 Haziran Stadyumu', city: 'Amasya', capacity: 7810 }} />);
    expect(html).toContain('>7.810<');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Zemin');
    expect(html).not.toContain('Adres');
    expect(html).not.toContain('google.com/maps');
  });

  it('hiç veri yok ya da yalnız ad / şehir → kart yok', () => {
    expect(renderToStaticMarkup(<MatchVenueCard venue={undefined} />)).toBe('');
    expect(renderToStaticMarkup(<MatchVenueCard venue={{ name: 'X', city: 'Y' }} />)).toBe('');
  });
});
